/**
 * Co hráč napíše, když trenér slib místa v sestavě dodrží nebo poruší. Sdílí je slib
 * z dohody s nespokojeným (transfers/offer-rejection-impact.ts) i slib z SMS
 * (messaging/coach-commitments.ts). Hráč dostane variantu, kterou ještě neposlal
 * (`sendPlayerTemplateSMS`): „díky že jste dodržel slovo s tou sestavou“ dřív přišlo 10×.
 */

/** Dodržený slib místa v sestavě (dohoda i slib z SMS, coach-commitments.ts). */
export const LINEUP_PROMISE_KEPT_SMS: readonly string[] = [
  "Trenére, díky že jste dodržel slovo s tou sestavou. Vážím si toho.",
  "Dodržel jste, co jste slíbil. Teď je na mně, abych to vracel na hřišti.",
  "Slíbil jste mi základ a dostal jsem ho. Díky, trenére, tohle si pamatuju.",
  "Trenére, řekl jste a platilo to. Takhle se mi hraje líp.",
  "Díky za šanci od začátku, trenére. Snad jsem vás nezklamal.",
  "Tak vidíte, trenére, slovo platí. Pokusím se vám to vrátit na hřišti.",
  "Trenére, že jste mě fakt stavěl, to se cení. Kluci to viděli taky.",
  "Beru to tak, že mi věříte. Díky, trenére, makám dál.",
];

/** Porušený slib místa v sestavě. */
export const LINEUP_PROMISE_BROKEN_SMS: readonly string[] = [
  "Sliboval jste mi místo v sestavě, trenére. A já zase sedím. Tohle nemá cenu.",
  "Trenére, měl jsem hrát od začátku. Nehrál jsem. Tak co ty sliby?",
  "Tak tolik ke slibu, trenére. Zase jsem začínal na lavičce.",
  "Řekl jste, že dostanu základ. Nedostal. Příště mi radši nic neslibujte.",
  "Trenére, já vám to věřil. A zase koukám z lavičky.",
  "Slib jste nedodržel, trenére. Dost mě to štve.",
  "Těšil jsem se na základ a nic. Takhle se mnou nejednejte, trenére.",
  "Trenére, sliby se mají dodržovat. Já sedím a vy děláte, že nic.",
];
