/**
 * Zpravodajské články o přestupech — generuje české texty s okresním humorem.
 */

import { logger } from "../lib/logger";
import type { Rng } from "../generators/rng";
import { districtPoolFor, type DistrictPool } from "../data/flavor/district-pool";

const HUMOR_POOL: DistrictPool<string> = {
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

const HUMOR_YOUNG_POOL: DistrictPool<string> = {
  core: [
    "Mladá krev! Snad vydrží aspoň do konce sezóny.",
    "Prý ho doporučil učitel tělocviku.",
    "Ještě nemá ani řidičák, ale na hřišti je jako blesk.",
    "Spoluhráči se těší — konečně někdo, kdo poběží místo nich.",
    "Mládí vpřed! A hlavně na tréninky.",
  ],
};

const HUMOR_OLD_POOL: DistrictPool<string> = {
  core: [
    "Zkušenosti k nezaplacení. Tedy — zaplatili jsme trochu.",
    "Říká se mu okresní Maldini.",
    "Kolena sice vrzou, ale hlava to pořád má.",
    "Veterán, který viděl víc sobot v kabině než většina hráčů.",
    "Přišel s vlastní masážní emulzí a ibuprofenem.",
  ],
};

export async function createTransferNews(
  db: D1Database,
  leagueId: string,
  teamId: string | null,
  type: string,
  data: {
    playerName: string;
    playerAge: number;
    playerPosition: string;
    teamName: string;
    fromTeamName?: string;
    toTeamName?: string;
    fee?: number;
    reason?: string;
    isCrossDistrict?: boolean;
  },
  rng?: { pick: <T>(arr: T[]) => T },
): Promise<void> {
  let headline = "";
  let body = "";
  // Okres pro lokalizaci hlášek — z ligy (nula úprav volajících, leagueId už předávají).
  const district = leagueId
    ? (await db.prepare("SELECT district FROM leagues WHERE id = ?").bind(leagueId).first<{ district: string }>()
        .catch((e) => { logger.warn({ module: "transfer-news" }, "load district", e); return null; }))?.district
    : undefined;
  const pick = rng?.pick.bind(rng) ?? ((arr: string[]) => arr[Math.floor(Math.random() * arr.length)]);
  const coreHumor = districtPoolFor(HUMOR_POOL, district);
  const agePool = data.playerAge <= 22
    ? [...coreHumor, ...districtPoolFor(HUMOR_YOUNG_POOL, district)]
    : data.playerAge >= 33
      ? [...coreHumor, ...districtPoolFor(HUMOR_OLD_POOL, district)]
      : coreHumor;
  const humor = pick(agePool);

  switch (type) {
    case "player_released":
      headline = `${data.teamName} se rozloučil s ${data.playerName}`;
      body = `Vedení ${data.teamName} se rozhodlo uvolnit ${data.playerName} (${data.playerAge}, ${data.playerPosition}). ${data.reason ?? "Důvody nejsou známy."} Je teď volný hráč.`;
      break;

    case "player_signed":
      headline = `${data.playerName} posílí kádr ${data.teamName}`;
      body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) podepsal za ${data.teamName}. ${humor}`;
      break;

    case "player_quit":
      headline = `${data.playerName} přestal chodit na tréninky`;
      body = `Fotbalista ${data.teamName} ${data.playerName} (${data.playerAge}) přestal docházet. ${data.reason ?? "Prý ho to nebaví."}`;
      break;

    case "transfer_completed":
      if (data.isCrossDistrict) {
        headline = `Posila z jiného okresu! ${data.playerName} přichází z ${data.fromTeamName}`;
        body = `${data.toTeamName} přivedl ${data.playerName} (${data.playerAge}, ${data.playerPosition}) až z ${data.fromTeamName}${data.fee ? ` za ${data.fee.toLocaleString("cs")} Kč` : ""}. Meziokresní přestup vzbudil pozornost — uvidíme, jestli se novému prostředí přizpůsobí.`;
      } else {
        headline = `Přestup! ${data.playerName} míří z ${data.fromTeamName} do ${data.toTeamName}`;
        body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) přestupuje z ${data.fromTeamName} do ${data.toTeamName}${data.fee ? ` za ${data.fee.toLocaleString("cs")} Kč` : ""}. ${humor}`;
      }
      break;

    case "loan_completed":
      headline = `Hostování: ${data.playerName} zamířil do ${data.toTeamName}`;
      body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) odchází z ${data.fromTeamName} na hostování do ${data.toTeamName}${data.fee ? ` za poplatek ${data.fee.toLocaleString("cs")} Kč` : ""}. Uvidíme, jestli se vrátí jako lepší hráč.`;
      break;

    case "loan_return":
      headline = `${data.playerName} se vrátil z hostování do ${data.teamName}`;
      body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) se vrací zpět do ${data.teamName} po skončení hostování${data.fromTeamName ? ` v ${data.fromTeamName}` : ""}.`;
      break;

    case "player_listed":
      headline = `${data.teamName} nabízí ${data.playerName} na přestup`;
      body = `Na přestupovém trhu se objevil ${data.playerName} (${data.playerAge}, ${data.playerPosition}) z ${data.teamName}. Požadovaná cena: ${(data.fee ?? 0).toLocaleString("cs")} Kč.`;
      break;

    case "player_sold":
      headline = `${data.playerName} prodán za ${(data.fee ?? 0).toLocaleString("cs")} Kč`;
      body = `${data.toTeamName} koupil ${data.playerName} od ${data.fromTeamName}. ${humor}`;
      break;

    default:
      return;
  }

  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'transfer', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(id, leagueId, teamId, headline, body).run().catch((e) => logger.warn({ module: "transfer-news" }, "insert news", e));
}
