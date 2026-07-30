"use strict";
/**
 * Zásobník textů pro interakce mezi manažery.
 *
 * Vesnický fotbalový humor s lokální příchutí Prachaticka (Šumava, Libín,
 * Boubín, Zlatá stezka, pouť, žně, houby, zabijačka). Texty jsou psané tak,
 * aby fungovaly v jakémkoliv okrese — místní reference jsou kořením, ne
 * podmínkou.
 *
 * Veškerá náhoda jde přes pick() — texty drží flavor, logika (delty vztahů)
 * zůstává v manager-relations.ts a routes/relations.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.statementRespectQuote = statementRespectQuote;
exports.statementProvokeQuote = statementProvokeQuote;
exports.statementHumbleQuote = statementHumbleQuote;
exports.counterQuoteText = counterQuoteText;
exports.adTextFor = adTextFor;
exports.jabNewsBody = jabNewsBody;
exports.praiseReplyText = praiseReplyText;
exports.praiseNews = praiseNews;
exports.beerSceneText = beerSceneText;
exports.dartsWinText = dartsWinText;
exports.dartsLossText = dartsLossText;
exports.stammtischNews = stammtischNews;
exports.stammtischQuarrelText = stammtischQuarrelText;
exports.stammtischDeclineText = stammtischDeclineText;
exports.stammtischSceneText = stammtischSceneText;
exports.pickStammtischEvents = pickStammtischEvents;
exports.pubRoundMessage = pubRoundMessage;
exports.giftSincereMessage = giftSincereMessage;
exports.giftPoisonMessage = giftPoisonMessage;
exports.betWonNews = betWonNews;
exports.betDrawNews = betDrawNews;
exports.derbyNews = derbyNews;
exports.humbleBackfireNews = humbleBackfireNews;
var district_pool_1 = require("../data/flavor/district-pool");
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ────────────────────────────────────────────────────────────────────────────
// Předzápasové výroky do novin
// ────────────────────────────────────────────────────────────────────────────
function statementRespectQuote(n, district) {
    return (0, district_pool_1.pickDistrictFlavor)({
        core: [
            "\u201E".concat(n.theirName, " hraje nejlep\u0161\u00ED fotbal \u0161iroko daleko. Bude to d\u0159ina a my to v\u00EDme,\u201C \u0159ekl p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EP\u0159ed ".concat(n.theirName, " klobouk dol\u016F. Ale v ned\u011Bli se to rozd\u00E1 f\u00E9rov\u011B na tr\u00E1v\u011B, ne v novin\u00E1ch,\u201C vzk\u00E1zal tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EZn\u00E1m jejich kluky z tr\u00E9nink\u016F i z hospody. Poctiv\u00ED chlapi, poctivej fotbal. T\u011B\u0161\u00EDm se na n\u011B,\u201C \u0159ekl tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EKdyby se fotbal hr\u00E1l jen na srdce, ".concat(n.theirName, " u\u017E d\u00E1vno slav\u00ED titul. Na\u0161t\u011Bst\u00ED se hraje i na nohy,\u201C uznale pok\u00FDval hlavou tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
        ],
        prachatice: [
            "\u201E".concat(n.theirName, " hraje nejlep\u0161\u00ED fotbal od Lib\u00EDna po Boub\u00EDn. Bude to d\u0159ina a my to v\u00EDme,\u201C \u0159ekl p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201ETren\u00E9r ".concat(n.theirManager, " odv\u00E1d\u00ED poctivou pr\u00E1ci. Tohle bude z\u00E1pas, na kter\u00FD m\u00E1 p\u0159ij\u00EDt cel\u00E1 n\u00E1ves,\u201C uznal kvality soupe\u0159e tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EMaj\u00ED formu jak bor\u016Fvky v \u010Dervenci. Jestli nebudeme stoprocentn\u00ED, odvezeme si n\u00E1\u0161up,\u201C smekl p\u0159ed soupe\u0159em tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EJejich z\u00E1loha \u0161lape jak hodiny na prachatick\u00FD v\u011B\u017Ei. Mus\u00EDme je vypnout d\u0159\u00EDv, ne\u017E se rozjedou,\u201C chv\u00E1lil soupe\u0159e tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201E".concat(n.theirName, " kombinuje tak \u010Dist\u011B, \u017Ee by p\u0159ed t\u00EDm i myslivci z Boub\u00EDna sundali klobouk. Bude to po\u0159\u00E1dn\u00E1 d\u0159ina,\u201C smekl p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201ECo ".concat(n.theirManager, " postavil ve Volarech, to na okrese jen tak nenajde\u0161. V ned\u011Bli si na n\u011B budeme muset d\u00E1t po\u0159\u00E1dn\u00FDho majzla,\u201C chv\u00E1lil soupe\u0159e tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EJejich hra je sladk\u00E1 jak lhenick\u00FD t\u0159e\u0161n\u011B. My budeme r\u00E1di za ka\u017Edej m\u00ED\u010D, co jim v\u016Fbec uzmeme,\u201C uznal kvality ".concat(n.theirName, " tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
        ],
        praha: [
            "\u201E".concat(n.theirName, " hraje nejl\u00EDp \u0161iroko daleko po Praze. Bude to d\u0159ina a my to v\u00EDme,\u201C \u0159ekl p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EMaj\u00ED formu jak metro ve \u0161pi\u010Dce \u2014 jede jim to bez zastaven\u00ED. Mus\u00EDme je vypnout v\u010Das,\u201C chv\u00E1lil soupe\u0159e tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EP\u0159ed ".concat(n.theirName, " smek\u00E1m. V ned\u011Bli se ale hraje na tr\u00E1v\u011B, ne na soci\u00E1ln\u00EDch s\u00EDt\u00EDch,\u201C vzk\u00E1zal tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201E".concat(n.theirName, " si dr\u017E\u00ED bal\u00F3n, jako by m\u011Bl p\u0159edplacenou l\u00EDta\u010Dku \u2014 po\u0159\u00E1d v pohybu a nikdy nezav\u00E1h\u00E1. Bude to d\u0159ina,\u201C smekl p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201ECo ".concat(n.theirManager, " vybudoval, \u0161lape jak dob\u0159e se\u0159\u00EDzenej karl\u00EDnskej korpor\u00E1t \u2014 v\u0161echno klape a nic se neztrat\u00ED. Klobouk dol\u016F,\u201C chv\u00E1lil soupe\u0159e tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EJejich z\u00E1lohu nezastav\u00ED\u0161, ani kdybys jim na And\u011Blu postavil z\u00E1taras. Mus\u00EDme b\u00FDt stoprocentn\u00ED,\u201C uznal kvality ".concat(n.theirName, " tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
        ],
    }, district, pick);
}
function statementProvokeQuote(n, district) {
    return (0, district_pool_1.pickDistrictFlavor)({
        core: [
            "\u201E".concat(n.theirName, "? Ti by neuhl\u00EDdali ani bal\u00F3n, nato\u017E n\u00E1\u0161 \u00FAtok,\u201C provokoval p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EP\u016Flka jejich sestavy hraje fotbal jen na pouti. A druh\u00E1 p\u016Flka ani to ne,\u201C nebral si serv\u00EDtky tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EPrej tr\u00E9nujou presink. Zat\u00EDm st\u00EDhaj presovat akor\u00E1t u v\u00FD\u010Depu,\u201C bavil se na \u00FA\u010Det soupe\u0159e tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EBe\u010Dku a\u0165 chlad\u00ED p\u0159edem. A po\u0159\u00E1dnou, ne tu jejich b\u0159e\u010Dku,\u201C hl\u00E1sil sebev\u011Bdom\u011B tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EJejich tren\u00E9r m\u00E1 taktiku z dob, kdy se je\u0161t\u011B psalo k\u0159\u00EDdou na vrata,\u201C provokoval kolegu tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201E".concat(n.theirManager, " \u0159\u00EDk\u00E1, \u017Ee maj\u00ED formu. Jo, formu na buchty,\u201C neodpustil si tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201ESly\u0161el jsem, \u017Ee p\u0159es l\u00E9to posilovali. Asi ten plot kolem h\u0159i\u0161t\u011B,\u201C u\u0161kl\u00EDbl se tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
        ],
        prachatice: [
            "\u201EVid\u011Bl jsem o v\u00EDkendu v lese h\u0159iby, co m\u011Bly lep\u0161\u00ED postaven\u00ED ne\u017E jejich obrana,\u201C r\u00FDpl si do soupe\u0159e tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EJejich h\u0159i\u0161t\u011B zn\u00E1 ka\u017Edej kanec ze \u0160umavy. Taky si na n\u011Bm ryje, kdo chce,\u201C vzk\u00E1zal sm\u011Brem k ".concat(n.theirName, " tren\u00E9r ").concat(n.myManager, "."),
            "\u201ENa Zlat\u00FD stezce se odjak\u017Eiva obchodovalo se sol\u00ED. My jim v ned\u011Bli osol\u00EDme,\u201C sliboval tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201E".concat(n.theirName, "? Ti se na tr\u00E1vn\u00EDku ztrat\u011Bj rychlejc ne\u017E houba\u0159 bez buzoly na Boub\u00EDn\u011B,\u201C provokoval p\u0159ed z\u00E1pasem tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201ESly\u0161el jsem, \u017Ee p\u0159es zimu d\u0159eli na kondi\u010Dce. Nejsp\u00ED\u0161 tahali traktor z bahna, b\u011Bhat po\u0159\u00E1d neum\u011Bj,\u201C u\u0161kl\u00EDbl se tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201E".concat(n.theirManager, " slibuje presink. Von akor\u00E1t stihne p\u0159es\u00EDknout jelito na zab\u00EDja\u010Dce,\u201C nebral si serv\u00EDtky tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
        ],
        praha: [
            "\u201EJejich obrana m\u00E1 rozestupy jak lidi v tramvaji \u2014 ka\u017Edej s\u00E1m za sebe,\u201C r\u00FDpl si tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201E".concat(n.theirName, "? Ti dr\u017E\u00ED bal\u00F3n asi jak Pra\u017E\u00E1k m\u00EDsto na parkov\u00E1n\u00ED \u2014 chvilku a je pry\u010D,\u201C provokoval tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EPrej maj\u00ED formu. Na Instagramu mo\u017En\u00E1. Na tr\u00E1v\u011B uvid\u00EDme,\u201C neodpustil si tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201E".concat(n.theirName, "? Ti se do v\u00E1pna dostanou tak akor\u00E1t, kdy\u017E je tam sveze metro,\u201C provokoval tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, ")."),
            "\u201EPrej maj\u00ED modern\u00ED styl. Jo, pop\u00EDjet craft pivo na n\u00E1plavce a fotit se u toho, to jim de,\u201C nebral si serv\u00EDtky tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
            "\u201EJejich obrana se otv\u00EDr\u00E1 jak kav\u00E1rna na Vinohradech \u2014 ka\u017Edou chv\u00EDli a pro ka\u017Ed\u00FDho,\u201C r\u00FDpl si tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
        ],
    }, district, pick);
}
function statementHumbleQuote(n) {
    return pick([
        "\u201EJedeme oslaben\u00ED, p\u016Flka k\u00E1dru m\u00E1 \u017En\u011B a druh\u00E1 kocovinu z pout\u011B,\u201C krotil o\u010Dek\u00E1v\u00E1n\u00ED tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
        "\u201E".concat(n.theirName, " je jasnej favorit. My vezeme akor\u00E1t dobrou n\u00E1ladu a rezervn\u00ED dresy,\u201C tvrdil skromn\u011B tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
        "\u201EKdy\u017E to nebude debakl, d\u00E1m kluk\u016Fm be\u010Dku. V\u00EDc fakt neslibuju,\u201C hr\u00E1l chud\u00E1\u010Dka tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
        "\u201EN\u00E1\u0161 c\u00EDl? Vr\u00E1tit se v jednom kuse a stihnout ve\u010Dern\u00ED dojen\u00ED. Body ne\u0159e\u0161\u00EDme,\u201C m\u00E1vl rukou tren\u00E9r ".concat(n.myManager, " z ").concat(n.myName, "."),
        "\u201EG\u00F3lman m\u00E1 namo\u017Een\u00FD z\u00E1da ze sena a stoper hl\u00EDd\u00E1 doma kr\u00E1vy. Jedeme to odchodit,\u201C st\u011B\u017Eoval si tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
        "\u201EProti ".concat(n.theirName, " jedeme maxim\u00E1ln\u011B pro kan\u00E1ra a dobrou klob\u00E1su,\u201C ne\u010Dekal nic tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, "."),
        "\u201EMy letos hrajeme o z\u00E1chranu dobr\u00E9 n\u00E1lady. Nic v\u00EDc v pl\u00E1nu nen\u00ED,\u201C ml\u017Eil tren\u00E9r ".concat(n.myManager, " (").concat(n.myName, ")."),
    ]);
}
function counterQuoteText(archetype, tone, n) {
    switch (archetype) {
        case "provokater":
            if (tone === "provoke") {
                return pick([
                    "\u201E".concat(n.myName, "? A\u0165 si nejd\u0159\u00EDv spo\u010D\u00EDtaj vlastn\u00ED g\u00F3ly. My jim v ned\u011Bli p\u00E1r p\u0159id\u00E1me,\u201C kontroval okam\u017Eit\u011B tren\u00E9r ").concat(n.theirManager, " z ").concat(n.theirName, "."),
                    "\u201EVelk\u00FD \u0159e\u010Di od mu\u017Estva, kter\u00FD naposledy n\u011Bco vyhr\u00E1lo v tombole,\u201C vyst\u0159elil zp\u00E1tky tren\u00E9r ".concat(n.theirManager, " (").concat(n.theirName, ")."),
                    "\u201EJestli hrajou fotbal tak dob\u0159e, jak mluv\u00ED do novin, tak se t\u011B\u0161\u00EDm. Zat\u00EDm teda mluv\u00ED l\u00EDp,\u201C op\u00E1\u010Dil tren\u00E9r ".concat(n.theirManager, " z ").concat(n.theirName, "."),
                ]);
            }
            return pick([
                "\u201EHezky mluv\u00ED. Na h\u0159i\u0161ti se ale mluvit nebude,\u201C r\u00FDpl si i p\u0159es vst\u0159\u00EDcn\u00E1 slova tren\u00E9r ".concat(n.theirManager, "."),
                "\u201EPochvala od nich? To budou cht\u00EDt nejsp\u00ED\u0161 p\u016Fj\u010Dit lajnova\u010Dku,\u201C zav\u011Bt\u0159il tren\u00E9r ".concat(n.theirManager, " z ").concat(n.theirName, "."),
            ]);
        case "urazeny":
            if (tone === "provoke") {
                return pick([
                    "Tren\u00E9r ".concat(n.theirManager, " se proti v\u00FDrok\u016Fm ost\u0159e ohradil: \u201ETohle se mezi slu\u0161nejma klubama ned\u011Bl\u00E1. \u0158ekl jsem redakci svoje a v\u00EDc to komentovat nebudu.\u201C Podle na\u0161ich informac\u00ED to komentoval je\u0161t\u011B dlouho."),
                    "\u201EJ\u00E1 si tyhle v\u011Bci pamatuju. A kluci v kabin\u011B taky,\u201C vzk\u00E1zal dot\u010Den\u011B tren\u00E9r ".concat(n.theirManager, " (").concat(n.theirName, ") a pr\u00E1skl za sebou dve\u0159mi kabiny."),
                ]);
            }
            return null;
        case "ferovka":
            if (tone === "respect") {
                return pick([
                    "\u201ESlu\u0161nost se na okrese po\u0159\u00E1d cen\u00ED. I my si jich v\u00E1\u017E\u00EDme a v ned\u011Bli to bude f\u00E9rovej fotbal,\u201C odpov\u011Bd\u011Bl tren\u00E9r ".concat(n.theirManager, "."),
                    "\u201ETakhle se m\u00E1 mluvit o soupe\u0159i. P\u0159ij\u010Fte se pod\u00EDvat, tohle bude fotbal jak m\u00E1 bejt,\u201C op\u011Btoval uzn\u00E1n\u00ED tren\u00E9r ".concat(n.theirManager, " z ").concat(n.theirName, "."),
                ]);
            }
            if (tone === "provoke") {
                return pick([
                    "\u201ENebudu se sni\u017Eovat k p\u0159est\u0159elk\u00E1m v novin\u00E1ch. Odpov\u00EDme na h\u0159i\u0161ti,\u201C \u0159ekl klidn\u011B tren\u00E9r ".concat(n.theirManager, "."),
                    "\u201EKa\u017Edej se prezentuje, jak um\u00ED. My um\u00EDme fotbal,\u201C odpov\u011Bd\u011Bl su\u0161e tren\u00E9r ".concat(n.theirManager, " z ").concat(n.theirName, "."),
                ]);
            }
            return null;
        case "pohodar":
            if (tone === "provoke") {
                return pick([
                    "\u201EDobr\u00FD, ne? Aspo\u0148 p\u0159ijde v\u00EDc lid\u00ED,\u201C sm\u00E1l se tren\u00E9r ".concat(n.theirManager, " a pozval kolegu po z\u00E1pase na pivo."),
                    "\u201EJ\u00E1 se urazit nestihnu, m\u00E1me zrovna seno,\u201C pokr\u010Dil rameny tren\u00E9r ".concat(n.theirManager, " z ").concat(n.theirName, "."),
                ]);
            }
            return null;
    }
}
// ────────────────────────────────────────────────────────────────────────────
// Anonymní inzeráty
// ────────────────────────────────────────────────────────────────────────────
function adTextFor(n) {
    var goals = Math.floor(Math.random() * 5) + 5;
    return pick([
        "Prod\u00E1m obranu, m\u00E1lo pou\u017E\u00EDvan\u00E1, projeto ".concat(goals, " g\u00F3ly. Zn.: ").concat(n.theirName),
        "Hled\u00E1 se \u00FAto\u010Dn\u00EDk. Naposledy vid\u011Bn st\u0159\u00EDlet na br\u00E1nu o pouti. Odm\u011Bna: pivo. Zn.: ".concat(n.theirName),
        "Vym\u011Bn\u00EDm t\u0159i body za cokoliv. I za slepice. Zn.: ".concat(n.theirName),
        "Daruji taktickou tabuli, z\u00E1novn\u00ED, majitel ji stejn\u011B nepou\u017E\u00EDv\u00E1. Zn.: kabina ".concat(n.theirName),
        "Koup\u00EDm g\u00F3ly. Levn\u011B. Sp\u011Bch\u00E1. Zn.: ".concat(n.theirName),
        "Pronajmu vlastn\u00ED v\u00E1pno. Soupe\u0159i ho stejn\u011B vyu\u017E\u00EDvaj\u00ED v\u00EDc ne\u017E my. Zn.: ".concat(n.theirName),
        "Ztratil se hern\u00ED projev. Naposledy vid\u011Bn loni na podzim u Blanice. Poctiv\u00E9mu n\u00E1lezci be\u010Dka. Zn.: ".concat(n.theirName),
        "Prod\u00E1m s\u00ED\u0165 z br\u00E1ny, pro\u0161oupan\u00E1 zevnit\u0159. Skoro nov\u00E1 zvenku. Zn.: brank\u00E1\u0159 ".concat(n.theirName),
        "Nab\u00EDz\u00EDm kondi\u010Dn\u00ED p\u0159\u00EDpravu mu\u017Estvu, kter\u00E9 nedob\u011Bhne ani posledn\u00ED autobus na Prachatice. Zn.: dobr\u00E1 du\u0161e",
        "Sh\u00E1n\u00EDm stopera, co se neboj\u00ED. Ti na\u0161i se boj\u00ED i vlastn\u00EDho g\u00F3lmana. Zn.: ".concat(n.theirName),
        "Prod\u00E1m kopa\u010Dky, 11 p\u00E1r\u016F, pou\u017E\u00EDvan\u00E9 jen na st\u00E1n\u00ED. Zn.: z\u00E1loha ".concat(n.theirName),
    ]);
}
// ────────────────────────────────────────────────────────────────────────────
// Pozápasové rýpnutí do novin (gesto jab)
// ────────────────────────────────────────────────────────────────────────────
function jabNewsBody(n, district) {
    return (0, district_pool_1.pickDistrictFlavor)({
        core: [
            "\u201ESoupe\u0159? Vid\u011Bli jste to sami. My jsme aspo\u0148 v\u011Bd\u011Bli, na kterou stranu se \u00FAto\u010D\u00ED,\u201C nechal se sly\u0161et tren\u00E9r ".concat(n.myName, " na adresu ").concat(n.theirName, ". V kabin\u011B ").concat(n.myName, " se pr\u00FD sm\u00E1li je\u0161t\u011B u t\u0159et\u00EDho piva."),
            "\u201EKdyby se body d\u00E1valy za \u0159e\u010Di, jsou mist\u0159i okresu u\u017E v srpnu,\u201C r\u00FDpl si po z\u00E1pase tren\u00E9r ".concat(n.myName, " do ").concat(n.theirName, "."),
            "\u201EPod\u011Bkoval bych jim za z\u00E1pas, ale ono se vlastn\u011B nic nekonalo,\u201C glosoval utk\u00E1n\u00ED s ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, ". Sly\u0161et to bylo pr\u00FD p\u0159es cel\u00FD are\u00E1l."),
            "\u201EJejich nejv\u011Bt\u0161\u00ED \u0161ance dneska? \u017De stihnou posledn\u00ED rundu v hospod\u011B,\u201C utrousil sm\u011Brem k ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EHr\u00E1li jsme proti jeden\u00E1cti ku\u017Eelk\u00E1m. Aspo\u0148 \u017Ee se nek\u00E1cely samy,\u201C neodpustil si tren\u00E9r ".concat(n.myName, " na \u00FA\u010Det ").concat(n.theirName, "."),
        ],
        prachatice: [
            "\u201ENa \u0160umav\u011B se \u0159\u00EDk\u00E1: kdo nic neum\u00ED, a\u0165 aspo\u0148 fauluje. Oni dneska zvl\u00E1dli oboj\u00ED naopak,\u201C vzk\u00E1zal po z\u00E1pase ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201E\u0158ekl bych, \u017Ee hr\u00E1li, jak kdy\u017E jde\u0161 z Vimperka do Netolic p\u011B\u0161ky \u2014 pomalu a s v\u011B\u010Dn\u00FDm rept\u00E1n\u00EDm,\u201C vzk\u00E1zal po z\u00E1pase ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, ". V kabin\u011B ").concat(n.myName, " se u toho \u0159ehtali a\u017E do zav\u00EDra\u010Dky."),
            "\u201EJejich obrana m\u011Bla dneska v\u00EDc d\u011Br ne\u017E ement\u00E1l na husineck\u00FD pouti,\u201C neodpustil si na \u00FA\u010Det ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EBr\u00E1nili se jak zaj\u00EDc na za\u010D\u00E1tku mysliveck\u00FD sez\u00F3ny \u2014 spousta pob\u00EDh\u00E1n\u00ED, m\u00E1lo platn\u00FD,\u201C glosoval utk\u00E1n\u00ED s ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
        ],
        praha: [
            "\u201EJejich nejv\u011Bt\u0161\u00ED \u0161ance dneska? \u017De chytnou posledn\u00ED tramvaj dom\u016F,\u201C utrousil sm\u011Brem k ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EHr\u00E1li, jako by \u010Dekali na spoj \u2014 po\u0159\u00E1d n\u011Bkam koukali, ale nikam nedo\u0161li,\u201C glosoval ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EJejich nejv\u011Bt\u0161\u00ED akce dneska? \u017De po z\u00E1pase stihli obsadit st\u016Fl v kav\u00E1rn\u011B na Sm\u00EDchov\u011B,\u201C utrousil sm\u011Brem k ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EHr\u00E1li jak korpor\u00E1t v p\u00E1tek odpoledne \u2014 hlavou u\u017E d\u00E1vno na n\u00E1plavce,\u201C glosoval ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
            "\u201EZa celej z\u00E1pas se dostali na na\u0161i polovinu asi tak \u010Dasto jak tramvaj na \u017Di\u017Ekov v\u010Das,\u201C neodpustil si na adresu ".concat(n.theirName, " tren\u00E9r ").concat(n.myName, "."),
        ],
    }, district, pick);
}
// ────────────────────────────────────────────────────────────────────────────
// Pochvala — odpovědi AI trenérů
// ────────────────────────────────────────────────────────────────────────────
function praiseReplyText(archetype, n) {
    switch (archetype) {
        case "ferovka":
            return pick([
                "".concat(n.theirManager, ": \u201ETohle pot\u011B\u0161\u00ED. Pozdravuj u v\u00E1s v kabin\u011B.\u201C"),
                "".concat(n.theirManager, ": \u201ED\u011Bkuju. Poctiv\u00E1 pr\u00E1ce se na okrese pozn\u00E1 \u2014 u v\u00E1s taky.\u201C"),
            ]);
        case "pohodar":
            return pick([
                "".concat(n.theirManager, ": \u201ENo vid\u00ED\u0161 \u2014 a pivo z toho jednou bude.\u201C"),
                "".concat(n.theirManager, ": \u201EJo? Tak to zapijeme, a\u017E pojede\u0161 kolem. Stav\u00EDme se u st\u00E1nku.\u201C"),
            ]);
        case "urazeny":
            return pick([
                "".concat(n.theirManager, ": \u201EHm. A co t\u00EDm jako myslel?\u201C Ale podle v\u0161eho ho to pot\u011B\u0161ilo."),
                "".concat(n.theirManager, " dlouho ml\u010Del a pak zabru\u010Del: \u201ENo\u2026 to je od n\u011Bj hezk\u00FD.\u201C Pochvalu si pr\u00FD vyst\u0159ihl z novin."),
            ]);
        case "provokater":
            return pick([
                "".concat(n.theirManager, ": \u201EJasn\u011B \u017Ee d\u011Bl\u00E1m dobrou pr\u00E1ci. Aspo\u0148 n\u011Bkdo na okrese to vid\u00ED.\u201C"),
                "".concat(n.theirManager, ": \u201EKone\u010Dn\u011B n\u011Bkdo s vkusem. \u0160koda \u017Ee mu to v ned\u011Bli budeme muset zkazit.\u201C"),
            ]);
    }
}
function praiseNews(n, district) {
    return (0, district_pool_1.pickDistrictFlavor)({
        core: [
            {
                headline: "Pochvala přes celý okres",
                body: "\u201E".concat(n.theirManager, " odv\u00E1d\u00ED v ").concat(n.theirName, " poctivou pr\u00E1ci. To se mus\u00ED um\u011Bt ocenit i u konkurence,\u201C vzk\u00E1zal kolegovi tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, ". Na okrese, kde se v\u00EDc pomlouv\u00E1 ne\u017E chv\u00E1l\u00ED, je to zpr\u00E1va sama o sob\u011B."),
            },
            {
                headline: "".concat(n.myManager, " smek\u00E1 p\u0159ed kolegou"),
                body: "Tren\u00E9r ".concat(n.myName, " ve\u0159ejn\u011B pochv\u00E1lil pr\u00E1ci, kterou ").concat(n.theirManager, " d\u011Bl\u00E1 v ").concat(n.theirName, ": \u201EKlobouk dol\u016F, takhle se vede man\u010Daft.\u201C Slu\u0161nost na okrese nevym\u0159ela."),
            },
        ],
        prachatice: [
            {
                headline: "Mezi trenéry to (kupodivu) vře respektem",
                body: "\u201ECo ".concat(n.theirManager, " dok\u00E1zal s ").concat(n.theirName, ", by mu mohl z\u00E1vid\u011Bt kdekdo od Blanice po Boub\u00EDn,\u201C nechal se sly\u0161et tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, "). Hospod\u0161t\u00ED \u0161tamgasti nev\u011B\u0159\u00ED vlastn\u00EDm u\u0161\u00EDm."),
            },
            {
                headline: "Respekt a\u017E za Boub\u00EDn",
                body: "\u201ECo ".concat(n.theirManager, " dok\u00E1zal s ").concat(n.theirName, ", by mu z\u00E1vid\u011Bl kdekdo od Vimperka po Netolice,\u201C smekl p\u0159ed kolegou tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, "). \u0160tamgasti u v\u00FD\u010Depu nev\u011B\u0159\u00ED vlastn\u00EDm u\u0161\u00EDm."),
            },
            {
                headline: "".concat(n.myManager, " chv\u00E1l\u00ED, n\u00E1ves krout\u00ED hlavou"),
                body: "Tren\u00E9r ".concat(n.myName, " ve\u0159ejn\u011B ocenil, jakou pr\u00E1ci odv\u00E1d\u00ED ").concat(n.theirManager, " v ").concat(n.theirName, ": \u201ETakhle poctiv\u011B se man\u010Daft vede jen m\u00E1lokde na \u0160umav\u011B.\u201C Na okrese, kde se u zab\u00EDja\u010Dky v\u00EDc pomlouv\u00E1 ne\u017E chv\u00E1l\u00ED, je to ud\u00E1lost."),
            },
            {
                headline: "Uzn\u00E1n\u00ED p\u0159es celou Zlatou stezku",
                body: "\u201E".concat(n.theirManager, " mak\u00E1 v ").concat(n.theirName, " jak myslivec p\u0159ed honem \u2014 poctiv\u011B a bez kec\u016F,\u201C nechal se sly\u0161et tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, ". Hospod\u0161t\u00ED \u0161tamgasti si rad\u0161i objednali dal\u0161\u00ED rundu, aby se z toho vzpamatovali."),
            },
        ],
        praha: [
            {
                headline: "Respekt napříč metropolí",
                body: "\u201ECo ".concat(n.theirManager, " dok\u00E1zal s ").concat(n.theirName, ", by mu z\u00E1vid\u011Bl kdekdo od Vltavy po Vinohrady,\u201C nechal se sly\u0161et tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, "). \u0160tamgasti u v\u00FD\u010Depu nev\u011B\u0159\u00ED vlastn\u00EDm u\u0161\u00EDm."),
            },
            {
                headline: "Respekt od Vltavy po \u017Di\u017Ekov",
                body: "\u201ECo ".concat(n.theirManager, " dok\u00E1zal s ").concat(n.theirName, ", by mu z\u00E1vid\u011Bl kdekdo od Karl\u00EDna po Sm\u00EDchov,\u201C smekl p\u0159ed kolegou tren\u00E9r ").concat(n.myManager, " (").concat(n.myName, "). \u0160tamgasti od v\u00FD\u010Depu nev\u011B\u0159\u00ED vlastn\u00EDm u\u0161\u00EDm."),
            },
            {
                headline: "".concat(n.myManager, " smek\u00E1 uprost\u0159ed metropole"),
                body: "Tren\u00E9r ".concat(n.myName, " ve\u0159ejn\u011B pochv\u00E1lil pr\u00E1ci, kterou ").concat(n.theirManager, " odv\u00E1d\u00ED v ").concat(n.theirName, ": \u201EKlobouk dol\u016F, takhle se dneska man\u010Daft vede m\u00E1lokde.\u201C I mezi k\u00E1vou a craft pivem na n\u00E1plavce z\u016Fstala slu\u0161nost."),
            },
            {
                headline: "Pochvala, co oblet\u011Bla Instagram",
                body: "\u201E".concat(n.theirManager, " vede ").concat(n.theirName, " tak, \u017Ee to \u010Dlov\u011Bk nevid\u00ED ani ve Spart\u011B,\u201C nechal se sly\u0161et tren\u00E9r ").concat(n.myManager, " z ").concat(n.myName, ". Do hodiny to viselo na v\u0161ech fotbalov\u00FDch profilech v Praze."),
            },
        ],
    }, district, pick);
}
// ────────────────────────────────────────────────────────────────────────────
// Pivo a šipky
// ────────────────────────────────────────────────────────────────────────────
function beerSceneText(n) {
    return pick([
        "Dobr\u00FD ve\u010Der u piva s tren\u00E9rem ".concat(n.theirName, ". Probralo se v\u0161echno od rozhod\u010D\u00EDch po ceny chmele."),
        "Dv\u011B hodiny, t\u0159i piva a historky z vojny. S tren\u00E9rem ".concat(n.theirName, " se vztahy budujou jedin\u011B takhle."),
        "U v\u00FD\u010Depu jste s tren\u00E9rem ".concat(n.theirName, " vy\u0159e\u0161ili sestavu reprezentace i to, kdo komu v devades\u00E1t\u00FDm osm\u00FDm ukopl kotn\u00EDk. Sm\u00EDch do zav\u00EDra\u010Dky."),
        "Tren\u00E9r ".concat(n.theirName, " platil druhou rundu a u t\u0159et\u00ED u\u017E jste si tykali. Hospoda si v\u00E1s fotila \u2014 tohle se na okrese nevid\u00ED."),
        "Ve\u010Der s tren\u00E9rem ".concat(n.theirName, " skon\u010Dil zp\u011Bvem u jukeboxu. Hospodsk\u00FD tvrd\u00ED, \u017Ee hor\u0161\u00ED duo nesly\u0161el, ale srdce to m\u011Blo."),
    ]);
}
function dartsWinText(n) {
    return pick([
        "Do\u0161lo i na \u0161ipky \u2014 a ".concat(n.theirManager, " kupoval rundu. Tohle se bude vypr\u00E1v\u011Bt."),
        "\u0160ipky: t\u0159i kola, jasn\u00E1 v\u011Bc. ".concat(n.theirManager, " platil rundu a mumlal n\u011Bco o rozh\u00E1zen\u00E9 sedmi\u010Dce."),
        "V \u0161ipk\u00E1ch jsi ho rozebral jak ned\u011Bln\u00ED ku\u0159e. ".concat(n.theirManager, " zaplatil rundu a chce odvetu."),
    ]);
}
function dartsLossText(n) {
    return pick([
        "\u0160ipky nevy\u0161ly \u2014 runda \u0161la za tebou. ".concat(n.theirManager, " se usm\u00EDval celej ve\u010Der."),
        "".concat(n.theirManager, " h\u00E1zel \u0161ipky, jako by celej \u017Eivot ned\u011Blal nic jin\u00FDho. Runda t\u011B st\u00E1la kus v\u00FDplaty i hrdosti."),
        "V \u0161ipk\u00E1ch t\u011B sundal levou zadn\u00ED. Hospoda tleskala, ty jsi platil.",
    ]);
}
// ────────────────────────────────────────────────────────────────────────────
// Posezení s trenéry (skupinové pivo)
// ────────────────────────────────────────────────────────────────────────────
function stammtischNews(hostManager, hostTeam, attendeeNames) {
    var guests = attendeeNames.join(", ");
    return pick([
        {
            headline: "Trenérský summit v hospodě",
            body: "Tren\u00E9r ".concat(hostManager, " (").concat(hostTeam, ") svolal ke sv\u00E9mu stolu kolegy z okresu: ").concat(guests, ". Co se domlouvalo u \u010Dtvrt\u00E9 rundy, se redakce nedozv\u011Bd\u011Bla \u2014 ale kdy\u017E sed\u00ED tolik tren\u00E9r\u016F u jednoho stolu, fanou\u0161ci maj\u00ED pr\u00E1vo spekulovat. P\u0159estupy? Spiknut\u00ED proti l\u00EDdrovi tabulky? Nebo jen mari\u00E1\u0161?"),
        },
        {
            headline: "U jednoho stolu celý přebor",
            body: "V hospod\u011B se se\u0161la tren\u00E9rsk\u00E1 elita okresu: ".concat(hostManager, " hostil kolegy (").concat(guests, "). \u0160tamgasti hl\u00E1s\u00ED, \u017Ee se hlasit\u011B sm\u00E1lo, dvakr\u00E1t p\u0159\u00EDsahalo na ofsajd a jednou m\u00E1lem do\u0161lo na ru\u010Dn\u00EDky. Okresn\u00ED fotbal se nehraje jen na tr\u00E1v\u011B."),
        },
        {
            headline: "Trenéři pili, okres šumí",
            body: "Tren\u00E9r ".concat(hostManager, " z ").concat(hostTeam, " zaplatil rundy koleg\u016Fm: ").concat(guests, ". \u201ENic jsme nedomlouvali, jen jsme probrali rozhod\u010D\u00ED,\u201C tvrd\u00ED \u00FA\u010Dastn\u00EDci jednohlasn\u011B. Tak jednohlasn\u011B, \u017Ee tomu nikdo nev\u011B\u0159\u00ED."),
        },
    ]);
}
function stammtischQuarrelText(mgrA, mgrB) {
    return pick([
        "".concat(mgrA, " a ").concat(mgrB, " se chytli kv\u016Fli ofsajdu z minul\u00E9 sez\u00F3ny \u2014 l\u00E9taly t\u00E1cky a ").concat(mgrB, " ode\u0161el p\u0159ed posledn\u00ED rundou"),
        "Mezi ".concat(mgrA, " a ").concat(mgrB, " to u stolu zajisk\u0159ilo: za\u010Dalo to penaltou z jara a skon\u010Dilo p\u0159evr\u017Eenou \u017Eidl\u00ED"),
        "".concat(mgrA, " p\u0159ipomn\u011Bl ").concat(mgrB, " prohranou be\u010Dku \u2014 a bylo zle. Hospodsk\u00FD je musel posadit ka\u017Ed\u00E9ho na jin\u00FD konec stolu"),
    ]);
}
function stammtischDeclineText(archetype, manager) {
    switch (archetype) {
        case "urazeny":
            return pick([
                "".concat(manager, " pozv\u00E1nku odm\u00EDtl. Vzk\u00E1zal, \u017Ee \u201Ev\u00ED, co si o n\u011Bm u toho stolu mysl\u00ED\u201C."),
                "".concat(manager, " nep\u0159i\u0161el. Pr\u00FD m\u011Bl \u201En\u011Bco s kr\u00E1l\u00EDkama\u201C, ale v\u0161ichni v\u011Bd\u00ED, \u017Ee se po\u0159\u00E1d zlob\u00ED."),
            ]);
        case "ferovka":
            return "".concat(manager, " se slu\u0161n\u011B omluvil \u2014 bez vz\u00E1jemn\u00E9ho respektu pr\u00FD ke stolu nesed\u00E1.");
        default:
            return "".concat(manager, " nedorazil.");
    }
}
function stammtischSceneText(attendeeCount) {
    if (attendeeCount >= 3) {
        return pick([
            "Stůl praskal ve švech, hospodský přinesl rezervní židle a večer skončil společným zpěvem.",
            "Velký stůl u okna, hodiny řečí o rozhodčích a tři rundy. Tohle si okres zapamatuje.",
        ]);
    }
    return pick([
        "Komorní posezení, ale řeči o fotbale do půlnoci.",
        "Menší sestava, o to upřímnější řeči u výčepu.",
    ]);
}
var STAMMTISCH_EVENTS = [
    // Pozitivní
    { kind: "positive", text: "{guest} přinesl domácí slivovici z vlastních švestek. Stůl ji jednohlasně schválil a hned bylo veseleji.", effect: "respect_all" },
    { kind: "positive", text: "Hospodský přinesl rundu na účet podniku — prý slaví výročí otevření. Trenéři si připili na okres.", effect: "respect_all" },
    { kind: "positive", text: "Místní opilec si přisedl a začal trenérům radit se sestavou. Vyprovodili ho společnými silami — a sblížilo je to víc než tři piva.", effect: "respect_all" },
    { kind: "positive", text: "{guest} prozradil hostiteli kontakt na levnější sudy na klubové akce. Tohle se mezi trenéry cení.", effect: "respect_all" },
    { kind: "positive", text: "Do hospody nakoukli fanoušci obou týmů — a místo hádky skončili u jednoho stolu s trenéry. Večer jak z plakátu o okresním fotbale.", effect: "respect_all" },
    // Vtipné
    { kind: "funny", text: "{guest} prohrál sázku, že vypije tuplák na ex. Vypil. Jak to vysvětlí doma, je jeho věc.", effect: "none" },
    { kind: "funny", text: "{host} vysvětloval rozestavení na pivních táccích. Štamgasti si tácky rozebrali na památku — prý „taktika mistrů“.", effect: "none" },
    { kind: "funny", text: "Štamgasti si trenéry spletli s komisí ze svazu. Hospodský pro jistotu schoval výherní automat a dvě hodiny se choval vzorně.", effect: "none" },
    { kind: "funny", text: "Hospodská vyhlásila rundu zdarma, když trenéři slíbili, že příště vezmou i manželky. Slib byl dán. Uvidíme.", effect: "none" },
    { kind: "funny", text: "{guest} zkusil trefit šipkou střed terče poslepu. Trefil rámeček dveří. Hospodský to nechá jako památku.", effect: "none" },
    { kind: "funny", text: "Na jukeboxu vyhrávala dechovka a {guest} tvrdil, že je to nejlepší nástupová hymna na okrese. Hlasovalo se. Prošlo to.", effect: "none" },
    // Konflikty
    { kind: "conflict", text: "Došlo na penaltu z 5. kola a {guest} bouchl do stolu tak, že spadly tři půllitry. Škodu zaplatil hostitel.", effect: "extra_cost" },
    { kind: "conflict", text: "{host} a {guest} se neshodli, kdo má nejhoršího rozhodčího v okrese. Chvíli bylo dusno, pak se přišlo na to, že je to stejný člověk.", effect: "heat_pair" },
    { kind: "conflict", text: "Řeč přišla na přetahování hráčů a {guest} si neodpustil poznámku o „nákupech za pivo“. Pár minut se mluvilo opatrně.", effect: "heat_pair" },
    { kind: "conflict", text: "{guest} začal vytahovat staré křivdy z podzimu. Hostitel to uhasil další rundou — dražší, ale účinné.", effect: "extra_cost" },
];
function pickStammtischEvents() {
    var events = [pick(STAMMTISCH_EVENTS)];
    if (Math.random() < 0.4) {
        var second = pick(STAMMTISCH_EVENTS.filter(function (e) { return e !== events[0]; }));
        events.push(second);
    }
    return events;
}
// ────────────────────────────────────────────────────────────────────────────
// Runda pro celou hospodu
// ────────────────────────────────────────────────────────────────────────────
function pubRoundMessage(patrons) {
    return pick([
        "Hospodsk\u00FD t\u0159ikr\u00E1t p\u0159epo\u010D\u00EDtal p\u016Fllitry: ".concat(patrons, " \u0161tamgast\u016F zvedlo sklenici na tvoje zdrav\u00ED. Tohle se ve vsi nezapom\u00EDn\u00E1."),
        "Runda pro v\u0161ech ".concat(patrons, " p\u0159\u00EDtomn\u00FDch! Hospoda zabur\u00E1cela, n\u011Bkdo za\u010Dal zp\u00EDvat a starosta si p\u0159ipil dvakr\u00E1t."),
        "".concat(patrons, " p\u00EDv na tv\u016Fj \u00FA\u010Det \u2014 a cel\u00E1 hospoda n\u00E1hle v\u00ED, kdo vyhr\u00E1l v\u00EDkendov\u00FD z\u00E1pas. Sl\u00E1va v\u00EDt\u011Bz\u016Fm."),
    ]);
}
// ────────────────────────────────────────────────────────────────────────────
// Dárkové koše
// ────────────────────────────────────────────────────────────────────────────
function giftSincereMessage() {
    return pick([
        "Koš s lahví a upřímnou kartičkou odeslán. Tohle se na okrese počítá.",
        "Koš s domácí slivovicí a vzkazem „Hlavu vzhůru“ je na cestě. Gesto, který se nezapomíná.",
        "Poslal jsi koš s medem, klobásou a poctivým vzkazem. Na vsi se o tom bude mluvit v dobrým.",
    ]);
}
function giftPoisonMessage() {
    return pick([
        "Koš s kartičkou „Ať se daří aspoň v hospodě“ odeslán. Kabina si fotku přeposílá dodnes.",
        "Koš s kartičkou „Přikládáme míč, ať si na něj zvyknou“ je na cestě. Kabina řve smíchy.",
        "Odeslán koš s pytlíkem kanárků a vzkazem „Krmení na příště“. Tohle ti nezapomenou.",
    ]);
}
// ────────────────────────────────────────────────────────────────────────────
// Sázky o bečku — články
// ────────────────────────────────────────────────────────────────────────────
function betWonNews(winnerName, loserName, score) {
    return pick([
        {
            headline: "".concat(loserName, " prohr\u00E1l be\u010Dku"),
            body: "Tren\u00E9\u0159i se p\u0159ed z\u00E1pasem vsadili o be\u010Dku piva. Po v\u00FDsledku ".concat(score, " plat\u00ED tren\u00E9r ").concat(loserName, " \u2014 v hospod\u011B ").concat(winnerName, " se dnes slav\u00ED dvakr\u00E1t."),
        },
        {
            headline: "Be\u010Dka m\u011Bn\u00ED majitele",
            body: "P\u0159edz\u00E1pasov\u00E1 s\u00E1zka tren\u00E9r\u016F m\u00E1 v\u00EDt\u011Bze. ".concat(winnerName, " bere body i be\u010Dku, tren\u00E9r ").concat(loserName, " u v\u00FD\u010Depu jen ti\u0161e po\u010D\u00EDtal \u00FAtratu. V\u00FDsledek ").concat(score, " mu p\u0159ipom\u00EDnat nemus\u00EDme \u2014 postar\u00E1 se o to cel\u00E1 n\u00E1ves."),
        },
        {
            headline: "Nejdra\u017E\u0161\u00ED pivo na okrese",
            body: "Tren\u00E9r ".concat(loserName, " se vsadil o be\u010Dku a po v\u00FDsledku ").concat(score, " plat\u00ED. \u201EP\u0159\u00ED\u0161t\u011B se vsad\u00EDm leda o zel\u0148a\u010Dku,\u201C ulevil si pr\u00FD cestou z h\u0159i\u0161t\u011B. V ").concat(winnerName, " u\u017E chlad\u00ED sklenice."),
        },
    ]);
}
function betDrawNews(homeName, awayName, score) {
    return pick([
        {
            headline: "Sázka o bečku skončila remízou",
            body: "Tren\u00E9\u0159i ".concat(homeName, " a ").concat(awayName, " se vsadili o be\u010Dku \u2014 jen\u017Ee z\u00E1pas skon\u010Dil ").concat(score, ". Be\u010Dka z\u016Fst\u00E1v\u00E1 v hospod\u011B a \u010Dek\u00E1 na odvetu."),
        },
        {
            headline: "Bečka zůstává za výčepem",
            body: "Rem\u00EDza ".concat(score, " mezi ").concat(homeName, " a ").concat(awayName, " nechala p\u0159edz\u00E1pasovou s\u00E1zku bez v\u00EDt\u011Bze. Hospodsk\u00FD pr\u00FD be\u010Dku ozna\u010Dil fixou a hl\u00EDd\u00E1 ji do odvety."),
        },
    ]);
}
// ────────────────────────────────────────────────────────────────────────────
// Derby a falešná skromnost — články
// ────────────────────────────────────────────────────────────────────────────
function derbyNews(homeName, awayName, winnerName, score) {
    return pick([
        {
            headline: "DERBY: ".concat(homeName, " ").concat(score, " ").concat(awayName),
            body: "".concat(winnerName, " ovl\u00E1dl derby pln\u00E9 emoc\u00ED. V hospod\u011B v\u00EDt\u011Bz\u016F se slav\u00ED, u pora\u017Een\u00FDch se dnes ml\u010D\u00ED a le\u0161t\u00ED se kosa na p\u0159\u00ED\u0161t\u011B."),
        },
        {
            headline: "Derby pro ".concat(winnerName, "!"),
            body: "Z\u00E1pas, o kter\u00E9m se na n\u00E1vsi mluvilo cel\u00FD t\u00FDden, skon\u010Dil ".concat(score, ". ").concat(winnerName, " m\u00E1 rok klid u piva \u2014 pora\u017Een\u00ED budou ka\u017Edou nar\u00E1\u017Eku polykat a\u017E do odvety."),
        },
        {
            headline: "".concat(winnerName, " bere derby a n\u00E1ves k tomu"),
            body: "V\u00FDsledek ".concat(score, " rozhodl o tom, kdo bude rok chodit po vsi s hlavou naho\u0159e. V\u00EDt\u011Bzn\u00E1 hospoda dol\u00E9vala do r\u00E1na, ta druh\u00E1 zav\u0159ela d\u0159\u00EDv."),
        },
    ]);
}
function humbleBackfireNews(actorName, actorManager, targetName, score) {
    return pick([
        {
            headline: "Skromnost, která bolela",
            body: "Tren\u00E9r ".concat(actorManager, " (").concat(actorName, ") cel\u00FD t\u00FDden tvrdil, jak jedou jen d\u016Fstojn\u011B prohr\u00E1t. Pak jeho t\u00FDm vyhr\u00E1l ").concat(score, ". V ").concat(targetName, " se o \u201Eskromnosti\u201C kolegy mluv\u00ED slovy, kter\u00E1 nelze otisknout."),
        },
        {
            headline: "Chud\u00E1\u010Dek z ".concat(actorName, " bral v\u0161echno"),
            body: "\u201EJedeme oslaben\u00ED, nic ne\u010Dek\u00E1me.\u201C V\u00FDsledek ".concat(score, " uk\u00E1zal, co byla p\u0159edz\u00E1pasov\u00E1 slova tren\u00E9ra ").concat(actorManager, " za\u010D. V ").concat(targetName, " maj\u00ED od ned\u011Ble nov\u00FD d\u016Fvod tr\u00E9novat \u2014 a nov\u00FD d\u016Fvod nezapom\u00EDnat."),
        },
        {
            headline: "Žně skončily, počítají se góly",
            body: "P\u0159ed z\u00E1pasem p\u016Flka k\u00E1dru ".concat(actorName, " \u00FAdajn\u011B sv\u00E1\u017Eela seno. Na h\u0159i\u0161ti pak svezli soupe\u0159e ").concat(score, ". Tren\u00E9r ").concat(targetName, " k tomu \u0159ekl jen: \u201ETak \u017En\u011B, jo?\u201C"),
        },
    ]);
}
