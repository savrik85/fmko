import type { Rng } from "./rng";
import type { GeneratedPlayer } from "./player";

/**
 * FMK-28: Pravidlový engine pro generování přezdívek.
 *
 * Přezdívka se odvozuje z příjmení, povolání, stavby těla,
 * vlastností nebo fotbalových atributů.
 */

// 1. Přezdívky z příjmení (zkrácení/zkomolení)
const SURNAME_NICKNAMES: Record<string, string[]> = {
  "Novák": ["Nový", "Novák"],
  "Svoboda": ["Svoby", "Svóba"],
  "Novotný": ["Noví", "Novota"],
  "Dvořák": ["Dvořas", "Dvořák"],
  "Černý": ["Černej", "Čert"],
  "Procházka": ["Prochás", "Procháska"],
  "Kučera": ["Kuča", "Kučka"],
  "Veselý": ["Veselej", "Smíšek"],
  "Horák": ["Hora", "Horáček"],
  "Němec": ["Němčík", "Němča"],
  "Pokorný": ["Pokora", "Poky"],
  "Marek": ["Márca", "Máreček"],
  "Pospíšil": ["Pospícha", "Šilhák"],
  "Hájek": ["Hája", "Háječek"],
  "Jelínek": ["Jelen", "Jelča"],
  "Král": ["Králík", "King"],
  "Růžička": ["Růža", "Růžek"],
  "Beneš": ["Béňa", "Benýsek"],
  "Fiala": ["Fíla", "Fialka"],
  "Sedláček": ["Sedla", "Sedlák"],
  "Doležal": ["Dolča", "Doly"],
  "Zeman": ["Zéma", "Zemák"],
  "Kolář": ["Koly", "Kolářík"],
  "Navrátil": ["Navrát", "Návrat"],
  "Čermák": ["Čerma", "Čermáček"],
  "Vaněk": ["Váňa", "Vanča"],
  "Urban": ["Urby", "Urbánek"],
  "Blažek": ["Blaža", "Blažík"],
  "Kříž": ["Křížek", "Kříža"],
  "Kopecký": ["Kopec", "Kopča"],
  "Konečný": ["Konča", "Konec"],
  "Malý": ["Malej", "Malíček"],
  "Holub": ["Holoubek", "Holubička"],
  "Štěpánek": ["Štěpa", "Štěpán"],
  "Kadlec": ["Kadla", "Kadlík"],
  "Vlček": ["Vlk", "Vlčák"],
  "Polák": ["Polan", "Polda"],
  "Šimek": ["Šíma", "Šimůnek"],
  "Kratochvíl": ["Kráta", "Kratoch"],
  "Bartoš": ["Bárta", "Bartík"],
  "Kovář": ["Kovy", "Kovářík"],
  "Musil": ["Musy", "Musílek"],
  "Říha": ["Říhy", "Říhák"],
  "Mareš": ["Márec", "Maršál"],
  "Moravec": ["Morava", "Moravák"],
  "Pavlík": ["Pávek", "Pavlas"],
  "Janda": ["Jandík", "Jandák"],
};

// 2. Přezdívky z povolání
const OCCUPATION_NICKNAMES: Record<string, string[]> = {
  "Řidič kamionu": ["Kamioňák", "Šofér", "Dálničář"],
  "Zedník": ["Malta", "Cihla", "Zídka"],
  "Tesař": ["Hobla", "Prkno", "Štípák"],
  "Instalatér": ["Trubka", "Klempna"],
  "Elektrikář": ["Drátek", "Proud", "Voltík"],
  "Mechanik": ["Šroubek", "Klíčník", "Motorka"],
  "Řezník": ["Buřtík", "Klobása", "Řízek"],
  "Pekař": ["Rohlík", "Houska", "Štrúdl"],
  "Hospodský": ["Čepař", "Pivo", "Výčepák"],
  "Prodavač": ["Krámek"],
  "Zemědělec": ["Sedlák", "Traktor", "Kombajn"],
  "Traktorista": ["Zetka", "Traktor", "Pluh"],
  "Lesní dělník": ["Dřevorubec", "Pila", "Lesák"],
  "Skladník": ["Paleta", "Vozík"],
  "Hasič": ["Hadičák", "Stříkačka", "Hasák"],
  "Policista": ["Fízl", "Polda", "Šerif"],
  "Učitel": ["Profesor", "Magistr", "Křída"],
  "Účetní": ["Kalkulačka", "Cifra"],
  "Programátor": ["Ajťák", "Kóder", "Nerd"],
  "Úředník": ["Razítko", "Formulář"],
  "Poštovní doručovatel": ["Listonoš", "Pošťák"],
  "Svářeč": ["Jiskra", "Elektroda"],
  "Malíř pokojů": ["Štětka", "Váleček"],
  "Automechanik": ["Motor", "Šroubek", "Karosář"],
  "Student": ["Žáček", "Školák", "Prvák"],
  "Nezaměstnaný": ["Volňásek", "Leháro"],
  "Podnikatel": ["Šéf", "Boss", "Firmař"],
  "Kuchař": ["Kuchta", "Guláš", "Šéfkuchař"],
  "Číšník": ["Pingl", "Kelner"],
  "Truhlář": ["Hobla", "Pilka", "Dřevo"],
  "Pokrývač": ["Střecha", "Taška"],
  "Záchranář": ["Doktor", "Záchranka"],
  "Správce hřiště": ["Správa", "Kustod"],
  "Důchodce": ["Děda", "Veterán", "Fotr"],
};

// 3. Přezdívky ze stavby těla
const BODY_NICKNAMES: Record<string, string[]> = {
  thin: ["Tyčka", "Sirka", "Špejle", "Hůlka", "Žížala"],
  athletic: ["Atlet", "Svalovka", "Rambo", "Mašina"],
  normal: [],
  stocky: ["Tank", "Buldok", "Hrouda", "Pařez"],
  obese: ["Bečka", "Buřtík", "Koule", "Sumo", "Pančák"],
};

// 4. Přezdívky z fotbalových atributů
function getSkillNicknames(player: GeneratedPlayer): string[] {
  const nicks: string[] = [];
  if (player.shooting >= 16) nicks.push("Dělo", "Kanón", "Bombarda");
  if (player.speed >= 16) nicks.push("Blesk", "Sprinter", "Turbo", "Raketa");
  if (player.speed <= 5) nicks.push("Šnek", "Šlapka", "Traktůrek");
  if (player.technique >= 16) nicks.push("Maestro", "Mág", "Zlatá noha");
  if (player.heading >= 16) nicks.push("Hlava", "Hlavička", "Žirafa");
  if (player.defense >= 16) nicks.push("Zeď", "Beton", "Hráz");
  if (player.goalkeeping >= 16) nicks.push("Pavouček", "Kočka", "Rukavice");
  if (player.alcohol >= 16) nicks.push("Pivko", "Bedrník", "Soudek");
  if (player.temper >= 16) nicks.push("Bouřka", "Dynamit", "Sopka");
  if (player.discipline <= 4) nicks.push("Divočák", "Rebel", "Anarchista");
  return nicks;
}

interface NicknameSource {
  nickname: string;
  weight: number;
}

/**
 * Generate a nickname for a player. Returns null if no nickname is assigned
 * (~20% of players might not have one).
 */
export function generateNickname(
  rng: Rng,
  player: GeneratedPlayer,
  existingNicknames: Set<string>,
): string | null {
  // ~20% chance of no nickname
  if (rng.random() < 0.15) return null;

  const candidates: NicknameSource[] = [];

  // From surname (highest weight)
  const surnameNicks = SURNAME_NICKNAMES[player.lastName];
  if (surnameNicks) {
    for (const n of surnameNicks) {
      candidates.push({ nickname: n, weight: 3 });
    }
  }

  // From occupation
  const occNicks = OCCUPATION_NICKNAMES[player.occupation];
  if (occNicks) {
    for (const n of occNicks) {
      candidates.push({ nickname: n, weight: 2 });
    }
  }

  // From body type
  const bodyNicks = BODY_NICKNAMES[player.bodyType];
  if (bodyNicks) {
    for (const n of bodyNicks) {
      candidates.push({ nickname: n, weight: 2 });
    }
  }

  // From skill extremes
  const skillNicks = getSkillNicknames(player);
  for (const n of skillNicks) {
    candidates.push({ nickname: n, weight: 2.5 });
  }

  if (candidates.length === 0) return null;

  // Filter out already used nicknames in team
  const available = candidates.filter((c) => !existingNicknames.has(c.nickname));
  if (available.length === 0) return null;

  // Weighted random selection
  const weights: Record<string, number> = {};
  for (const c of available) {
    weights[c.nickname] = (weights[c.nickname] ?? 0) + c.weight;
  }

  const nickname = rng.weighted(weights);
  existingNicknames.add(nickname);
  return nickname;
}
