/**
 * FMK-48: Generátor vtipných popisů hráčů.
 */

import type { Rng } from "./rng";

interface DescContext {
  firstName: string;
  lastName: string;
  nickname: string;
  age: number;
  position: string;
  occupation: string;
  bodyType: string;
  alcohol: number;
  discipline: number;
  speed: number;
  shooting: number;
  technique: number;
  patriotism: number;
}

const TEMPLATES: Array<(ctx: DescContext) => string | null> = [
  // Age-based
  (ctx) => ctx.age >= 45 ? `Hraje od devadesátek. Neběhá, ale ví kde má stát.` : null,
  (ctx) => ctx.age >= 40 ? `Veterán, který pamatuje ještě staré hřiště. Kolena skřípou, ale srdce je velké.` : null,
  (ctx) => ctx.age <= 18 ? `Talent, ale radši by hrál PlayStation.` : null,
  (ctx) => ctx.age <= 18 ? `Nejmladší v kádru. Maminka mu balí svačinu na zápas.` : null,
  (ctx) => ctx.age <= 20 ? `Mladý a dravý. Dává góly, ale zapomíná chodit na tréninky.` : null,

  // Occupation-based
  (ctx) => ctx.occupation === "Řezník" ? `Na fotbal chodí hlavně kvůli pivu po zápase. Ale v ${ctx.position === "GK" ? "bráně" : "soubojích"} umí zázraky.` : null,
  (ctx) => ctx.occupation === "Hasič" ? `Požáry hasí v práci i na hřišti. Jeho střela jednou rozbila okno u Nováků.` : null,
  (ctx) => ctx.occupation === "Policista" ? `Na hřišti stejně nekompromisní jako v práci.` : null,
  (ctx) => ctx.occupation === "Programátor" ? `Jediný v týmu kdo umí obsloužit web. Přihrávky jako algoritmicky přesné.` : null,
  (ctx) => ctx.occupation === "Účetní" ? `Pomalý, ale s přehledem. Říká se, že kalkuluje i trajektorii míče.` : null,
  (ctx) => ctx.occupation === "Traktorista" ? `Přezdívku si vysloužil stavbou těla. Soupeři se mu vyhýbají.` : null,
  (ctx) => ctx.occupation === "Důchodce" ? `V důchodu má konečně čas na fotbal. Problém je, že tělo už ne.` : null,
  (ctx) => ctx.occupation === "Student" ? `Koupe víc než studuje, ale to je v jeho věku normální.` : null,
  (ctx) => ctx.occupation === "Zemědělec" ? `Celý týden na poli, v neděli na hřišti. A večer v hospodě.` : null,
  (ctx) => ctx.occupation === "Kuchař" ? `Vaří pro celý tým po zápase. Jeho guláš je legendární.` : null,

  // Personality-based
  (ctx) => ctx.alcohol >= 16 ? `Páteční hospoda je pro něj povinná. Nedělní zápas volitelný.` : null,
  (ctx) => ctx.alcohol >= 14 ? `S pivem v ruce se cítí lépe než s míčem.` : null,
  (ctx) => ctx.discipline >= 17 ? `Spolehlivý jako švýcarské hodinky. Škoda že ty hodinky jsou z Číny.` : null,
  (ctx) => ctx.discipline <= 5 ? `Trénink? To je to co se dělá před zápasem, ne?` : null,
  (ctx) => ctx.patriotism >= 17 ? `Za tenhle klub by dal ruku do ohně. A občas ji tam dává.` : null,

  // Skill-based
  (ctx) => ctx.shooting >= 16 ? `Jeho střela se jednou odrazila od tyče a rozbila okno u starosty.` : null,
  (ctx) => ctx.speed >= 16 ? `Když chce, je nejrychlejší na hřišti. Problém je, že nechce vždycky.` : null,
  (ctx) => ctx.speed <= 5 ? `Říkají mu šnek, ale on tomu říká 'herní inteligence'.` : null,
  (ctx) => ctx.technique >= 16 ? `S míčem u nohy vypadá jako Brazilec. Bez míče jako turista.` : null,

  // Body-based
  (ctx) => ctx.bodyType === "obese" ? `Na váze nešetří. Ale v soubojích taky ne.` : null,
  (ctx) => ctx.bodyType === "thin" ? `Když se otočí bokem, není vidět.` : null,

  // Position-based
  (ctx) => ctx.position === "GK" ? `Do brány šel, protože nikdo jiný nechtěl. Teď je nenahraditelný.` : null,
  (ctx) => ctx.position === "GK" ? `Brankář, protože běhat se mu nechce.` : null,

  // Fallbacks
  () => "Řadový vojáček kádru. Nic extra, ale vždy spolehlivý.",
  () => "Přišel hrát fotbal a pít pivo. Obojí zvládá průměrně.",
  () => "Srdcař, který nikdy nevynechá zápas. Tréninky jsou jiná věc.",
  () => "Má rád fotbal, ale fotbal nemá vždy rád jeho.",
];

export function generateDescription(rng: Rng, ctx: DescContext): string {
  // Try specific templates first
  const applicable = TEMPLATES
    .map((fn) => fn(ctx))
    .filter((r): r is string => r !== null);

  if (applicable.length > 0) {
    return rng.pick(applicable);
  }

  return "Řadový vojáček kádru.";
}
