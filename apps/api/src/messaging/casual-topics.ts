/**
 * Zprávy „jen tak": hráč se trenérovi ozve, aniž by si na něco stěžoval. Zeptá se,
 * jak se má, pošle fotku z rybníka, pozve ho na zabijačku nebo se zeptá, jestli se
 * může stavit. Do 10/2026 psal hráč sám od sebe skoro jen stížnosti, přitom
 * manažeři si s hráči rádi píšou a hrají role (prod 17.–24. 10.: 144 SMS trenérů).
 *
 * Kdo a co píše, řídí vztah k trenérovi (pásma v packages/shared coach.ts):
 * kamarád zve a posílá fotky, „Bere tě" napíše leda praktickou věc, kdo trenéra
 * nemá rád, ten se jen tak neozve vůbec. K tomu povaha, věk, roční doba, den
 * a to, co hráč zrovna dělá (`playerTimeContext`): z práce fotka pracoviště,
 * z hospody pozvánka, v listopadu zabijačka.
 *
 * Neodpovězená zpráva „jen tak" nikoho neurazí (expireStaleAiThreads), jinak by
 * víc zpráv znamenalo víc povinností.
 */

import type { KdePije, Situace } from "./chat-kontext";
import type { AiScenario, PlayerSnapshot } from "./ai-player-scenarios";

/** Kam hráč trenéra zve. Přijaté pozvání má dopad (casual-messages.ts `applyAcceptedInvite`). */
export type InviteKind = "pub" | "bbq" | "fishing" | "pig_slaughter" | "feast" | "wedding" | "baby" | "visit";

/** Co se o chvíli, kdy hráč píše, ví. */
export interface CasualContext {
  /** Měsíc 1–12 a den v týdnu (0 = neděle) v Praze. */
  month: number;
  weekday: number;
  /** Hodina 0–23 v Praze. */
  hour: number;
  situation: Situace;
  drinksAt: KdePije | null;
  /** V práci a k jeho pracovišti máme fotku (`workPhotoScene`). */
  workplacePhoto: boolean;
  lastOutcome: "win" | "loss" | "draw" | null;
}

export interface CasualTopic extends AiScenario {
  category: "casual";
  /** Od jakého vztahu k trenérovi hráč takhle píše: 40 Bere tě, 60 Má tě rád, 80 Jste kamarádi. */
  minRelation: number;
  /**
   * Fotka (klíč v `PHOTO_SCENES`), `work` = z pracoviště podle povolání. Text na ni navazuje
   * („koukej, co jsem chytil"), takže když se nepovede, zpráva se nepošle a hráč se ozve jindy.
   */
  photo?: string;
  /** Jen v téhle životní situaci (`club_incidents.kind`). */
  lifeSituation?: string;
  /** Od kolika let (hospoda, bál): sedmnáctiletý student zval trenéra na panáka (náhled 2026-10-24). */
  minAge?: number;
  /** Jak moc se téma hodí teď, 0 = nehodí. Vztah a životní situaci hlídá `topicFits`. */
  fit: (p: PlayerSnapshot, ctx: CasualContext) => number;
}

const free = (s: Situace) => s === "po_praci" || s === "volno";
const between = (hour: number, from: number, to: number) => hour >= from && hour < to;
const weekendish = (weekday: number) => weekday === 0 || weekday === 5 || weekday === 6;

/**
 * Úvod každého tématu. Bez něj model psal i do přátelské zprávy výčitku
 * („a kdy mě konečně postavíš?"), protože tak zní většina jeho ostatních zadání.
 */
const JUST_BECAUSE = "Píšeš trenérovi jen tak, nic nepotřebuješ vyřešit a na NIC si nestěžuješ (ani na sestavu, ani na trénink).";

export const CASUAL_TOPICS: CasualTopic[] = [
  {
    id: "casual_how_are_you",
    label: "Jak se máš",
    category: "casual",
    expectedTurns: 2,
    minRelation: 60,
    description: `${JUST_BECAUSE} Zeptej se ho, jak se má a co dělá. Když tým naposledy prohrál, zeptej se, jak to nese, `
      + "a povzbuď ho. Lidsky a krátce, jako kamarádovi.",
    weight: () => 0,
    fit: (p, ctx) => !free(ctx.situation) || !between(ctx.hour, 9, 22) ? 0
      : 2 + (ctx.lastOutcome === "loss" ? 3 : 0) + (p.coachRelationship >= 80 ? 1 : 0),
  },
  {
    id: "casual_pub_evening",
    label: "Pojď na jedno",
    category: "casual",
    expectedTurns: 3,
    minRelation: 50,
    description: `${JUST_BECAUSE} Sedíš večer s partou z týmu v hospodě, je veselo, na stole piva a panáky. `
      + "Posíláš trenérovi fotku stolu a zveš ho, ať se staví, klidně s vtipem, že platí rundu. Když jste kamarádi, "
      + "zveš ho srdečně; jinak spíš ze slušnosti.",
    weight: () => 0,
    photo: "pub_round",
    atPub: true,
    invite: "pub",
    minAge: 18,
    fit: (p, ctx) => ctx.situation !== "pije" || ctx.drinksAt !== "hospoda" || !between(ctx.hour, 18, 23) ? 0
      : 3 + (p.alcohol > 60 ? 2 : 0) + (weekendish(ctx.weekday) ? 2 : 0),
  },
  {
    id: "casual_work_photo",
    label: "Fotka z práce",
    category: "casual",
    expectedTurns: 2,
    minRelation: 40,
    description: `${JUST_BECAUSE} Jsi v práci a máš chvilku pauzu. Posíláš trenérovi fotku z práce, ať vidí, kde dneska `
      + "makáš. Jedna dvě věty, klidně s povzdechem nebo vtipem, ale nic po něm nechceš.",
    weight: () => 0,
    photo: "work",
    fit: (_p, ctx) => ctx.situation === "prace" && ctx.workplacePhoto && between(ctx.hour, 7, 20) ? 2 : 0,
  },
  {
    id: "casual_fishing",
    label: "Na rybách",
    category: "casual",
    expectedTurns: 3,
    minRelation: 60,
    description: `${JUST_BECAUSE} Byl jsi na rybách a chytil jsi pěkného kapra. Chlubíš se trenérovi fotkou. Když jste `
      + "kamarádi, pozvi ho, ať jde zítra s tebou k rybníku.",
    weight: () => 0,
    photo: "fishing_catch",
    invite: "fishing",
    fit: (p, ctx) => ctx.month < 4 || ctx.month > 10 || !free(ctx.situation) || !between(ctx.hour, 7, 20) ? 0
      : 1 + (weekendish(ctx.weekday) ? 2 : 0) + (p.age >= 25 ? 1 : 0),
  },
  {
    id: "casual_mushrooms",
    label: "Na houbách",
    category: "casual",
    expectedTurns: 2,
    minRelation: 50,
    description: `${JUST_BECAUSE} Byl jsi na houbách a máš plný košík hřibů. Pochlub se trenérovi fotkou. Když tě má `
      + "rád, nabídni mu, že mu pár kousků přineseš na smaženici.",
    weight: () => 0,
    photo: "mushrooms_basket",
    fit: (_p, ctx) => ctx.month < 8 || ctx.month > 10 || !free(ctx.situation) || !between(ctx.hour, 8, 19) ? 0
      : 2 + (weekendish(ctx.weekday) ? 2 : 0),
  },
  {
    id: "casual_pig_slaughter",
    label: "Zabijačka",
    category: "casual",
    expectedTurns: 3,
    minRelation: 60,
    description: `${JUST_BECAUSE} Dneska se u vás doma dělala zabijačka a večer se u vás sejde pár lidí na ovar, jitrnice `
      + "a štamprli. Pošli trenérovi fotku stolu a pozvi ho, ať se dneska večer staví. Když nejste kamarádi, zveš ho spíš ze slušnosti.",
    weight: () => 0,
    photo: "pig_slaughter_table",
    invite: "pig_slaughter",
    minAge: 18,
    fit: (p, ctx) => ![11, 12, 1, 2].includes(ctx.month) || !free(ctx.situation) || !between(ctx.hour, 11, 19)
      || ![5, 6].includes(ctx.weekday) ? 0
      : 3 + (p.age >= 25 ? 1 : 0) + (p.patriotism > 60 ? 1 : 0),
  },
  {
    id: "casual_bbq",
    label: "Grilovačka",
    category: "casual",
    expectedTurns: 3,
    minRelation: 60,
    description: `${JUST_BECAUSE} Zítra u sebe na zahradě griluješ s pár klukama z týmu. Pošli trenérovi fotku grilu `
      + "a pozvi ho na zítřek, ať se staví.",
    weight: () => 0,
    photo: "bbq_grill",
    invite: "bbq",
    fit: (p, ctx) => ctx.month < 5 || ctx.month > 9 || !free(ctx.situation) || !between(ctx.hour, 12, 21)
      || ![4, 5, 6].includes(ctx.weekday) ? 0
      : 2 + (p.age >= 24 ? 1 : 0),
  },
  {
    id: "casual_village_feast",
    label: "Posvícení",
    category: "casual",
    expectedTurns: 3,
    minRelation: 60,
    description: `${JUST_BECAUSE} Zítra je ve vsi posvícení. Doma se pečou koláče a večer je v sále muzika. Pošli trenérovi `
      + "fotku plechu s koláči a pozvi ho, ať zítra přijde na koláč a pak do sálu.",
    weight: () => 0,
    photo: "feast_cakes",
    invite: "feast",
    fit: (p, ctx) => ctx.month < 9 || ctx.month > 11 || !free(ctx.situation) || !between(ctx.hour, 10, 20)
      || ![4, 5].includes(ctx.weekday) ? 0
      : 1 + (p.patriotism > 55 ? 3 : 0),
  },
  {
    id: "casual_village_ball",
    label: "Hasičský bál",
    category: "casual",
    expectedTurns: 3,
    minRelation: 60,
    description: `${JUST_BECAUSE} V sobotu je ve vsi hasičský bál a ty tam jdeš s partou z týmu. Zeptej se trenéra, `
      + "jestli nepřijde taky, ať je sranda.",
    weight: () => 0,
    invite: "feast",
    minAge: 18,
    fit: (p, ctx) => ctx.month > 2 || !free(ctx.situation) || !between(ctx.hour, 10, 21) || ![3, 4, 5].includes(ctx.weekday) ? 0
      : 1 + (p.patriotism > 55 ? 3 : 0),
  },
  {
    id: "casual_drop_by",
    label: "Můžu se stavit?",
    category: "casual",
    expectedTurns: 3,
    minRelation: 50,
    description: `${JUST_BECAUSE} Chtěl by ses zítra po práci stavit za trenérem, potřebuješ s ním osobně probrat svůj `
      + "fotbal: co máš zlepšit a jak s tebou počítá. Nejsi naštvaný, jen to chceš slyšet do očí. Zeptej se, jestli se můžeš stavit.",
    weight: () => 0,
    invite: "visit",
    fit: (p, ctx) => !free(ctx.situation) || !between(ctx.hour, 15, 21) ? 0 : p.age <= 25 ? 3 : 1,
  },
  {
    id: "casual_gift",
    label: "Něco vám přinesu",
    category: "casual",
    expectedTurns: 2,
    minRelation: 70,
    description: `${JUST_BECAUSE} Máš doma přebytek z hospodářství (vajíčka od slepic, med, jablka) a chceš trenérovi `
      + "něco přinést. Pošli fotku a zeptej se, kdy mu to můžeš hodit.",
    weight: () => 0,
    photo: "gift_basket",
    fit: (p, ctx) => !free(ctx.situation) || !between(ctx.hour, 9, 20) ? 0 : 1 + (p.age >= 30 ? 1 : 0),
  },
  {
    id: "casual_new_boots",
    label: "Nové kopačky",
    category: "casual",
    expectedTurns: 2,
    minRelation: 40,
    description: `${JUST_BECAUSE} Koupil sis nové kopačky a chlubíš se trenérovi fotkou. Těšíš se, až v nich nastoupíš.`,
    weight: () => 0,
    photo: "new_boots",
    fit: (p, ctx) => p.age > 27 || !free(ctx.situation) || !between(ctx.hour, 10, 22) ? 0 : 2,
  },
  {
    id: "casual_wedding",
    label: "Pozvánka na svatbu",
    category: "casual",
    expectedTurns: 3,
    minRelation: 40,
    description: `${JUST_BECAUSE} Dneska ses oženil a večer je zábava v sále. Pošli trenérovi fotku prstýnků a pozvi ho, `
      + "ať večer přijde, aspoň na chvíli.",
    weight: () => 0,
    photo: "wedding_rings",
    invite: "wedding",
    lifeSituation: "svatba_spoluhrace",
    fit: (_p, ctx) => ctx.situation === "spi" || !between(ctx.hour, 9, 20) ? 0 : 8,
  },
  {
    id: "casual_baby",
    label: "Narodilo se mu dítě",
    category: "casual",
    expectedTurns: 3,
    minRelation: 40,
    description: `${JUST_BECAUSE} Narodilo se ti dítě. Pošli trenérovi fotku malých botiček a pozvi ho, ať se zítra staví `
      + "zapít malýho. Jméno ani pohlaví dítěte si nevymýšlej, piš „malej\" nebo „mrně\".",
    weight: () => 0,
    photo: "baby_shoes",
    invite: "baby",
    lifeSituation: "narozeni_ditete",
    fit: (_p, ctx) => ctx.situation === "spi" || !between(ctx.hour, 9, 21) ? 0 : 8,
  },
  {
    id: "casual_ride",
    label: "Vezmete mě?",
    category: "casual",
    expectedTurns: 2,
    minRelation: 40,
    description: `${JUST_BECAUSE} Vzali ti řidičák. Zeptej se trenéra, jestli by tě nevzal na příští zápas venku, nebo `
      + "jestli neví, kdo z kluků jede kolem tebe. Klidně si ze sebe udělej srandu.",
    weight: () => 0,
    lifeSituation: "zabaveny_ridicak",
    fit: (_p, ctx) => ctx.situation === "spi" || !between(ctx.hour, 9, 21) ? 0 : 4,
  },
  {
    id: "casual_job_tip",
    label: "Nevíte o práci?",
    category: "casual",
    expectedTurns: 2,
    minRelation: 50,
    description: `${JUST_BECAUSE} Přišel jsi o práci. Zeptej se trenéra, jestli neví o nějaké práci nebo brigádě, třeba u `
      + "někoho, kdo má ke klubu blízko. Nefňukej, jen se ptáš.",
    weight: () => 0,
    lifeSituation: "prisel_o_praci",
    fit: (_p, ctx) => ctx.situation === "spi" || !between(ctx.hour, 9, 20) ? 0 : 4,
  },

  // Navazující zprávy (follow-ups.ts). Náhodně se nevybírají (fit 0), slouží jako scénář
  // pro odpovědi, když na ně trenér zareaguje.
  {
    id: "casual_invite_thanks",
    label: "Díky, že jsi přišel",
    category: "casual",
    expectedTurns: 2,
    minRelation: 0,
    description: "Trenér přijal tvoje pozvání a přišel. Děkuješ mu, že dorazil, a je ti dobře, že s vámi byl. "
      + "Nic konkrétního o tom, co se dělo, si nevymýšlej, žádné historky s lidmi mimo tým.",
    weight: () => 0,
    fit: () => 0,
  },
  {
    id: "casual_hangover",
    label: "Ráno po hospodě",
    category: "casual",
    expectedTurns: 2,
    minRelation: 0,
    description: "Včera večer jsi trenérovi opilý poslal hlasovku z hospody. Teď je ráno a máš kocovinu. Podle povahy se "
      + "omluv, nebo to se smíchem zlehči. Nezapírej, že jsi pil. Co přesně jsi v hlasovce říkal, víš jen z historie.",
    weight: () => 0,
    fit: () => 0,
  },
];

/**
 * Co pozvání znamená, když ho trenér přijme. `label` jde do otázky „přijal?",
 * `thanks` je pokyn pro poděkování po akci, `afterHours` kdy zhruba po přijetí
 * hráč poděkuje (pak se posune na chvíli, kdy hráč nespí a nemaká).
 */
export const INVITES: Record<InviteKind, {
  label: string; thanks: string; photo?: string; afterHours: number; relation: number; morale: number;
  /** Poděkování smí přijít i z práce (ráno po hospodě s kocovinou). */
  fromWork?: boolean;
}> = {
  pub: {
    label: "na pivo za partou do hospody",
    thanks: "Včera večer za vámi trenér na tvoje pozvání opravdu přišel do hospody a zaplatil rundu. Je ráno a ty mu píšeš, že to bylo super, že dorazil. Klidně s narážkou na kocovinu.",
    photo: "pub_celebration", afterHours: 10, relation: 6, morale: 4, fromWork: true,
  },
  pig_slaughter: {
    label: "na zabijačku k nim domů",
    thanks: "Trenér na tvoje pozvání včera přišel k vám na zabijačku. Píšeš mu, že doma byli rádi, a ptáš se, jestli mu chutnalo.",
    photo: "pig_slaughter_table", afterHours: 13, relation: 6, morale: 4,
  },
  wedding: {
    label: "na jeho svatební zábavu",
    thanks: "Trenér na tvoje pozvání přišel na tvoji svatební zábavu. Děkuješ mu, žena i rodina byli rádi.",
    photo: "wedding_rings", afterHours: 14, relation: 8, morale: 4,
  },
  visit: {
    label: "jestli se za ním může zítra po práci stavit probrat svůj fotbal",
    thanks: "Stavil ses za trenérem, jak jste se domluvili, a probrali jste tvůj fotbal. Děkuješ mu za čas a píšeš, že ti to pomohlo. Co přesně říkal, si nevymýšlej.",
    afterHours: 26, relation: 5, morale: 5,
  },
  fishing: {
    label: "zítra na ryby k rybníku",
    thanks: "Trenér s tebou na tvoje pozvání byl na rybách. Píšeš mu, že to bylo fajn, a klidně si rýpni, kdo chytil víc.",
    photo: "fishing_catch", afterHours: 30, relation: 6, morale: 4,
  },
  baby: {
    label: "zapít narození jeho dítěte",
    thanks: "Trenér se na tvoje pozvání stavil zapít narození tvého dítěte. Děkuješ mu. Jméno ani pohlaví dítěte si nevymýšlej.",
    photo: "baby_shoes", afterHours: 30, relation: 6, morale: 4,
  },
  bbq: {
    label: "na grilovačku na zahradu",
    thanks: "Trenér na tvoje pozvání přišel na grilovačku. Píšeš mu, že jste rádi, že dorazil, a že to bylo fajn.",
    photo: "bbq_grill", afterHours: 36, relation: 6, morale: 4,
  },
  feast: {
    label: "na posvícení nebo bál ve vsi",
    thanks: "Trenér na tvoje pozvání přišel na zábavu ve vsi. Píšeš mu, že to bylo fajn, že dorazil, a že lidi ho rádi viděli.",
    // Bez fotky: stejné pozvání platí pro posvícení i hasičský bál, koláče by k bálu neseděly.
    afterHours: 36, relation: 6, morale: 4,
  },
};

/** Hodí se téma pro hráče teď? Vrací váhu, 0 = ne. */
export function topicFits(topic: CasualTopic, player: PlayerSnapshot, ctx: CasualContext): number {
  if (!topicAllowed(topic, player)) return 0;
  if (topic.photo === "work" && !ctx.workplacePhoto) return 0;
  return Math.max(0, topic.fit(player, ctx));
}

/**
 * Smí hráč téma vůbec napsat (vztah, věk, životní situace)? Platí i pro vynucené téma
 * z adminu, které přeskakuje jen čas a roční dobu.
 */
export function topicAllowed(topic: CasualTopic, player: PlayerSnapshot): boolean {
  return player.coachRelationship >= topic.minRelation
    && player.age >= (topic.minAge ?? 0)
    && (!topic.lifeSituation || player.zivotniSituace?.kind === topic.lifeSituation);
}

/** Nejnižší vztah, při kterém hráč napíše aspoň něco. Kdo je pod ním, jen tak nepíše vůbec. */
export const CASUAL_MIN_RELATION = Math.min(...CASUAL_TOPICS.filter((t) => t.minRelation > 0).map((t) => t.minRelation));
