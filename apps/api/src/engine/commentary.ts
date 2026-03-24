/**
 * FMK-34: Komentářový systém — šablony ve stylu obecního rozhlasu.
 *
 * Generuje vtipné české komentáře k zápasovým událostem.
 */

import type { Rng } from '../generators/rng';
import type { MatchEvent, EventType } from '@okresni-masina/shared';

interface CommentaryTemplate {
  event: EventType;
  template: string;
  tags: string[];
  minSkill?: number;
}

// Reakce diváků (pool pro {crowd_reaction})
const CROWD_REACTIONS = [
  'Na tribuně se zvedla vlna nadšení — tedy oba dva diváci.',
  'Místní chlapi u piva přestali na chvíli řešit politiku.',
  'Děda Vašek se probudil a zeptal se, co se stalo.',
  'Paní Nováková zavolala z okna, ať nekřičí.',
  'Pes, co leží za brankou, zvedl hlavu.',
  'U stánku přestali točit párek v rohlíku.',
  'Na parkovišti někdo zatroubil.',
  'Šest diváků aplauduje, sedmý zapíná mobil na video.',
  'Starosta se usmívá — investice do trávníku se vyplatila.',
  'Hospodský za plotem přinesl pivo pro gólmana.',
];

// Šablony komentářů
const TEMPLATES: CommentaryTemplate[] = [
  // === GÓLY (15) ===
  { event: 'goal', template: 'GÓÓÓL! {player} to tam napálil! {crowd_reaction}', tags: ['epic'] },
  { event: 'goal', template: '{player} zakončuje a je to tam! {minute}. minuta a vedeme!', tags: ['normal'] },
  { event: 'goal', template: 'Parádní akce! {player} si to obhodil a uklidil to k tyči!', tags: ['epic'], minSkill: 14 },
  { event: 'goal', template: '{player} hlavou po rohu — brankář jen koukal!', tags: ['header'] },
  { event: 'goal', template: 'No tak {player} se trefil. Upřímně, ani on tomu nevěří.', tags: ['funny'] },
  { event: 'goal', template: '{player} střílí zpoza vápna a míč se odráží od obránce do branky. Počítá se!', tags: ['lucky'] },
  { event: 'goal', template: 'Gól! {player} proměňuje penaltu. Brankář skákal doprava, míč šel doleva. Klasika.', tags: ['penalty'] },
  { event: 'goal', template: '{player} to tam doslova dotlačil. Nebyla to krása, ale je to gól.', tags: ['ugly'] },
  { event: 'goal', template: 'Bomba od {player}! To se muselo slyšet až v hospodě!', tags: ['epic'], minSkill: 12 },
  { event: 'goal', template: '{player} si naběhl za obranu a s přehledem skóruje. Offside? Rozhodčí říká ne.', tags: ['normal'] },
  { event: 'goal', template: 'Brankář pustil míč pod rukama a {player} to dopíchl do prázdné brány.', tags: ['gk_error'] },
  { event: 'goal', template: '{player} to zkusil z půlky a ono to spadlo! Gól roku okresu!', tags: ['epic', 'funny'] },
  { event: 'goal', template: 'Vlastní gól! Obránce {player} si to nešťastně srazil do vlastní sítě.', tags: ['own_goal'] },
  { event: 'goal', template: '{player} přebírá dlouhý nákop, otáčí se a pálí! Gól!', tags: ['long_ball'] },
  { event: 'goal', template: 'Po rohovém kopu největší zmatek a {player} to tam nějak dostal. 1:0!', tags: ['messy'] },

  // === ŠANCE (10) ===
  { event: 'chance', template: '{player} pálí — těsně vedle! O chlup.', tags: ['miss'] },
  { event: 'chance', template: 'Střela {player} — břevno! To je smůla!', tags: ['woodwork'] },
  { event: 'chance', template: '{player} sám před brankářem — a brankář chytá! Výborný zákrok!', tags: ['save'] },
  { event: 'chance', template: '{player} hlavičkuje — tyč! Ten zvuk se rozlehl celým hřištěm.', tags: ['woodwork'] },
  { event: 'chance', template: 'Šance! {player} to trefil do brankáře z pěti metrů. To se neodpouští.', tags: ['miss', 'funny'] },
  { event: 'chance', template: '{player} střílí — obránce blokuje na poslední chvíli!', tags: ['block'] },
  { event: 'chance', template: 'Nádherná kombinace, ale {player} to na konci přestřelil.', tags: ['miss'] },
  { event: 'chance', template: '{player} zkouší lob přes brankáře — míč letí nad. Škoda.', tags: ['miss'] },
  { event: 'chance', template: 'Brankář vyběhl a {player} to netrefil prázdnou bránu. Nevěřím!', tags: ['miss', 'funny'] },
  { event: 'chance', template: '{player} pálí zpoza vápna — brankář vyráží na roh.', tags: ['save'] },

  // === FAULY A KARTY (10) ===
  { event: 'foul', template: '{player} sekl soupeře zezadu. Rozhodčí píská.', tags: ['hard'] },
  { event: 'foul', template: 'Tvrdý zákrok {player}. To bolelo.', tags: ['hard'] },
  { event: 'foul', template: '{player} podrazil protihráče. Divil by ses, ale rozhodčí to viděl.', tags: ['funny'] },
  { event: 'foul', template: 'Faul na střední čáře. {player} to trochu přehnal.', tags: ['normal'] },
  { event: 'foul', template: '{player} v souboji o míč trefil všechno kromě míče.', tags: ['funny'] },
  { event: 'card', template: 'Žlutá karta! {player} si to mohl odpustit.', tags: ['yellow'] },
  { event: 'card', template: 'Rozhodčí tasí žlutou pro {player}. Přísné, ale spravedlivé.', tags: ['yellow'] },
  { event: 'card', template: 'ČERVENÁ pro {player}! Do sprch! {crowd_reaction}', tags: ['red'] },
  { event: 'card', template: '{player} dostává žlutou za protesty. Měl radši mlčet.', tags: ['yellow'] },
  { event: 'card', template: 'Druhá žlutá a {player} jde dolů! Tým bude hrát v deseti.', tags: ['red'] },

  // === ZRANĚNÍ (5) ===
  { event: 'injury', template: '{player} leží na zemi a drží se za nohu. Vypadá to vážně.', tags: ['serious'] },
  { event: 'injury', template: 'Křeče u {player}. Asi ta včerejší zabijačka.', tags: ['cramps', 'funny'] },
  { event: 'injury', template: '{player} si podvrtl kotník. Správce hřiště nese magický sprej.', tags: ['ankle'] },
  { event: 'injury', template: '{player} dostal ránu do obličeje. Nos vypadá rovně... asi.', tags: ['face'] },
  { event: 'injury', template: "{player} kulhá, ale odmítá střídání. 'To nic není,' říká.", tags: ['tough'] },

  // === STŘÍDÁNÍ (5) ===
  { event: 'substitution', template: 'Střídání: {player} jde na hřiště. Čerstvá krev!', tags: ['normal'] },
  { event: 'substitution', template: '{player} nastupuje za zraněného spoluhráče. Musí do toho hned.', tags: ['injury_sub'] },
  { event: 'substitution', template: 'Trenér stahuje unavené hráče. Na hřiště jde {player}.', tags: ['tactical'] },
  { event: 'substitution', template: '{player} běží na hřiště. Rozcvičoval se celý poločas u stánku.', tags: ['funny'] },
  { event: 'substitution', template: 'Na hřiště přichází {player}. Šatna voněla sprchou, ale on ne.', tags: ['funny'] },

  // === SPECIÁLNÍ UDÁLOSTI ===
  { event: 'special', template: '{player} se drží za kolena a nemůže dál. Kondice na nule.', tags: ['exhausted'] },
  { event: 'special', template: "{player} se hádá s rozhodčím. 'Máte to doma trénovat, pane Malý!'", tags: ['argument'] },
  { event: 'special', template: '{player} vypadá, že včerejší hospoda se podepsala. Běhá jak po Novém roce.', tags: ['hangover'] },
  { event: 'special', template: "Divák u lajny: 'To bych dal i já, a to mám padesát!'", tags: ['crowd'] },
  { event: 'special', template: "Od plotu se ozývá: 'Rozhodčí, na oči!'", tags: ['crowd'] },
  { event: 'special', template: "Sousedka z okna volá: 'Tak co, vedeme?'", tags: ['crowd'] },
  { event: 'special', template: "Děda u plotu: 'Za mých časů se hrálo líp!'", tags: ['crowd'] },
  { event: 'special', template: "U stánku s párky se tvoří fronta. Zápas nikoho nezajímá.", tags: ['crowd'] },
  { event: 'special', template: '{player} přiběhl pozdě. Prý mu nejel autobus. Bydlí přes ulici.', tags: ['late', 'funny'] },
  { event: 'special', template: '{player} předvedl zákrok sezóny! Odkud se to v něm vzalo?', tags: ['gk_hero'] },
  { event: 'special', template: 'Na hřiště vběhl pes. Má lepší kontrolu míče než polovina hráčů.', tags: ['dog', 'funny'] },
  { event: 'special', template: '{player} volá na lavičku, jestli mu někdo podá vodu. Správce hřiště nese pivo.', tags: ['funny'] },
  { event: 'special', template: '{player} si upravuje chrániče. Nebo to byl telefon?', tags: ['funny'] },
  { event: 'special', template: 'Rozhodčí se dívá na hodinky. Asi pospíchá na autobus.', tags: ['funny'] },
  { event: 'special', template: 'Poločas! U stánku je guláš za padesátku a pivo za třicet.', tags: ['half_time'] },
  { event: 'special', template: 'Trenér si při kraji hřiště zapálil cigaretu. Asi ho to stresuje.', tags: ['half_time', 'funny'] },
  { event: 'special', template: 'Začíná druhá půle. Někteří hráči se vracejí od stánku.', tags: ['half_time'] },
  { event: 'special', template: 'Konec zápasu! Obě mužstva míří do hospody na rozbor.', tags: ['full_time'] },
  { event: 'special', template: 'Píská se konec! Rozhodčí utíká k autu — pro jistotu.', tags: ['full_time', 'funny'] },
  { event: 'special', template: 'Padla tma. Reflektory na tomhle hřišti nejsou, takže se dohrávalo poslepu.', tags: ['atmosphere'] },

  // === POSSESSION — zobrazují se často, potřeba hodně variant ===
  { event: 'special', template: '{team} kombinují přes střed hřiště.', tags: ['possession'] },
  { event: 'special', template: '{team} kontrolují tempo hry.', tags: ['possession'] },
  { event: 'special', template: 'Tvrdý pressing {team}. Soupeř se nemůže dostat z vlastní půlky.', tags: ['possession'] },
  { event: 'special', template: '{player} rozehrává z hloubky pole.', tags: ['possession'] },
  { event: 'special', template: '{team} si nahrávají na polovině soupeře.', tags: ['possession'] },
  { event: 'special', template: 'Soupeř stahuje obranu, {team} hledají prostor.', tags: ['possession'] },
  { event: 'special', template: 'Dlouhý míč od {player}, {team} zrychlují.', tags: ['possession'] },
  { event: 'special', template: 'Hra se přesouvá na polovinu soupeře.', tags: ['possession'] },
  { event: 'special', template: '{team} mají míč. Zatím nic nebezpečného.', tags: ['possession'] },
  { event: 'special', template: '{player} vede míč po křídle. Hledá přihrávku.', tags: ['possession'] },
  { event: 'special', template: '{team} pomalu budují útok. Trpělivá hra.', tags: ['possession'] },
  { event: 'special', template: '{player} nahrává do středu — míč se vrací zpět do obrany.', tags: ['possession'] },
  { event: 'special', template: 'Rozehrávka od brankáře. {team} začínají znovu.', tags: ['possession'] },
  { event: 'special', template: '{team} tlačí dopředu. Obrana soupeře má plné ruce práce.', tags: ['possession'] },
  { event: 'special', template: '{player} se snaží projít přes dva hráče. Neúspěšně.', tags: ['possession'] },
  { event: 'special', template: 'Krátká nahrávka {player} na spoluhráče. Tempo se zrychluje.', tags: ['possession'] },
  { event: 'special', template: '{team} drží míč. Soupeř čeká na chybu.', tags: ['possession'] },
  { event: 'special', template: 'Centr od {player} — nikdo se k němu nedostal.', tags: ['possession'] },
  { event: 'special', template: '{player} posílá míč na druhou stranu. Přepínání hry.', tags: ['possession'] },
  { event: 'special', template: '{team} se snaží najít mezeru v obraně.', tags: ['possession'] },
];

/**
 * Generate a commentary line for a match event.
 */
export function generateCommentary(
  rng: Rng,
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
): string {
  // Find matching templates — prefer tag-specific ones
  let matching = TEMPLATES.filter((t) => t.event === event.type);
  if (event.detail && matching.length > 0) {
    const tagSpecific = matching.filter((t) => t.tags.includes(event.detail!));
    if (tagSpecific.length > 0) matching = tagSpecific;
  }
  if (matching.length === 0) return event.description;

  const template = rng.pick(matching);
  const crowdReaction = rng.pick(CROWD_REACTIONS);
  const teamName = event.teamId === 1 ? homeTeamName : awayTeamName;

  return template.template
    .replace('{player}', event.playerName)
    .replace('{team}', teamName)
    .replace('{minute}', String(event.minute))
    .replace('{score}', `${homeScore}:${awayScore}`)
    .replace('{crowd_reaction}', crowdReaction);
}

/**
 * Generate full commentary for all events in a match.
 */
export function generateMatchCommentary(
  rng: Rng,
  events: MatchEvent[],
  homeTeamName: string,
  awayTeamName: string,
): string[] {
  let homeScore = 0;
  let awayScore = 0;

  return events.map((event) => {
    if (event.type === 'goal') {
      // Update running score from event detail
      const scores = event.detail?.split(':').map(Number);
      if (scores && scores.length === 2) {
        homeScore = scores[0];
        awayScore = scores[1];
      }
    }
    return `${event.minute}' — ${generateCommentary(rng, event, homeTeamName, awayTeamName, homeScore, awayScore)}`;
  });
}
