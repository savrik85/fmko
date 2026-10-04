/**
 * Předseda cizího klubu, se kterým se jedná o přestupu. Klub mimo hru nemá v databázi
 * žádné lidi, takže se předseda skládá deterministicky z názvu klubu: stejný klub má
 * pořád stejného předsedu se stejným obličejem. Obličej i jména jsou z generátoru
 * obecních představitelů (starší chlapi z vesnice).
 */

import { createRng } from "../generators/rng";
import { generateOfficialFace, hashSeed, LAST_NAMES_M, MALE_FIRST_NAMES } from "../villages/officials-generator";

export interface ClubChairman {
  name: string;
  age: number;
  avatar: Record<string, unknown>;
}

export function clubChairman(clubName: string): ClubChairman {
  const rng = createRng(hashSeed(`predseda|${clubName}|v1`));
  const firstName = MALE_FIRST_NAMES[rng.int(0, MALE_FIRST_NAMES.length - 1)];
  const lastName = LAST_NAMES_M[rng.int(0, LAST_NAMES_M.length - 1)];
  const age = rng.int(48, 72);
  return { name: `${firstName} ${lastName}`, age, avatar: generateOfficialFace(rng, false) };
}
