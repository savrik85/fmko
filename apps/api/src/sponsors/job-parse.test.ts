import { describe, expect, it } from "vitest";
import { findRosterPlayer, jobHint, matchFirm, parseJobAsk, parseJobHelpPromise, type RosterPlayer } from "./job-parse";

const ROSTER: RosterPlayer[] = [
  { id: "p-novak", firstName: "Jan", lastName: "Novák", nickname: "Honza", lostJob: true },
  { id: "p-dvorak", firstName: "Petr", lastName: "Dvořák", nickname: null, lostJob: false },
  { id: "p-svoboda", firstName: "Marek", lastName: "Svoboda", nickname: null, lostJob: false },
  { id: "p-marek", firstName: "Lukáš", lastName: "Marek", nickname: "Lukyn", lostJob: false },
  { id: "p-cerny", firstName: "Tomáš", lastName: "Černý", nickname: null, lostJob: false },
  { id: "p-kucera1", firstName: "Josef", lastName: "Kučera", nickname: null, lostJob: false },
  { id: "p-kucera2", firstName: "Martin", lastName: "Kučera", nickname: null, lostJob: false },
];

describe("trenér shání hráči práci (dlouhé hovorové SMS s překlepy)", () => {
  const job = [
    "Dobrej den pane Kučero, nemáte náhodou u vás na pile nějaký místo pro Nováka? Kluk přišel o fleka a doma má malý děcka, byl bych vám fakt vděčnej",
    "Zdravim šéfe, potřeboval bych pomoct, Dvořákovi zavřeli fabriku a hledá práci, nevzal by jste ho k sobě do dílny? Je šikovnej, makat umí",
    "ahoj Pepo, nesháníte náhodou lidi do skladu? mam tu jednoho kluka co je ted bez prace, Marek Svoboda, spolehlivej a nepije",
    "dobrej den, nemel by jste u vas misto pro novaka? kluk prisel o praci a nevi co s nim, doma mu to zere nervy",
    "Pane majiteli, šlo by zaměstnat našeho Černýho? Má papíry na vozík a v sobotu chodí hrát, víc nepotřebuje",
    "čau, nevíš o nějaký brigádě pro Lukyna? Kluk se flákal půl roku po ztrátě místa, potřebuje se chytit",
    "Dobrý den, hledáte pracovníky do provozu? Svoboda zůstal bez práce, rád by u vás makal",
    "Kurva šéfe, Dvořák je zase bez práce, nevzal byste ho do dílny? Jinak se nám ten debil uchlastá",
  ];
  for (const text of job) {
    it(`pozná shánění práce: ${text.slice(0, 50)}…`, () => {
      expect(parseJobAsk(text).intent).toBe(true);
      expect(jobHint(text)).toBe(true);
    });
  }

  const notJob = [
    "Dobrý den, potřebovali bychom 20 tisíc na nový dresy, starý jsou už fakt na hadry, pomohl byste nám prosím?",
    "Dobrej, za tu práci s mládeží bych potřeboval aspoň 15 000 na míče a kužely, kluci by vám poděkovali",
    "Potřeboval bych půjčit nějaký prachy, kluci nemaj na kopačky a já nemám z čeho, vrátím to po sezóně",
    "Pane Novák, díky moc za podporu, kluci v sobotu makali jak draci, příště to snad bude lepší výsledek",
    "dobry den nemohl by jste nam prispet na tribunu? strecha zatejka a lidi nadávaj, stačilo by pár tisíc",
    "Jo jasně, v sobotu přijďte, vezmu vás na pivo do kabiny po zápase, platím já",
    "Do prdele, potřebujem 10 tisíc na míče, jinak budem v sobotu hrát s hadrákem jak za komunistů",
    "Novák potřebuje místo v sestavě, ne na lavičce, ale to je moje starost, díky za podporu",
  ];
  for (const text of notJob) {
    it(`nepozná práci tam, kde není: ${text.slice(0, 50)}…`, () => {
      expect(parseJobAsk(text).intent).toBe(false);
    });
  }
});

describe("findRosterPlayer: hráč ve zprávě i ve skloňování", () => {
  it("najde hráče podle příjmení v různých pádech, přezdívky a bez diakritiky", () => {
    expect(findRosterPlayer("místo pro Nováka", ROSTER).player?.id).toBe("p-novak");
    expect(findRosterPlayer("misto pro novaka", ROSTER).player?.id).toBe("p-novak");
    expect(findRosterPlayer("Dvořákovi zavřeli fabriku", ROSTER).player?.id).toBe("p-dvorak");
    expect(findRosterPlayer("zaměstnat našeho Černýho", ROSTER).player?.id).toBe("p-cerny");
    expect(findRosterPlayer("brigáda pro Lukyna", ROSTER).player?.id).toBe("p-marek");
    expect(findRosterPlayer("vzal byste Marka Svobodu", ROSTER).player?.id).toBe("p-svoboda");
  });

  it("dva Kučerové bez křestního jména = nejasné, s křestním jménem jasné", () => {
    const r = findRosterPlayer("nevzal byste Kučeru?", ROSTER);
    expect(r.player).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(findRosterPlayer("nevzal byste Martina Kučeru?", ROSTER).player?.id).toBe("p-kucera2");
  });

  it("bez jména nikoho nenajde", () => {
    expect(findRosterPlayer("máte místo pro jednoho kluka?", ROSTER)).toEqual({ player: null, ambiguous: false });
  });
});

describe("matchFirm: firma jmenovaná v SMS", () => {
  const firms = [
    { id: 1, name: "Pila Novák" }, { id: 2, name: "Hospoda U Kubíčka" }, { id: 3, name: "Madeta" }, { id: 4, name: "Obecní úřad" },
  ];
  it("pozná firmu podle jména majitele nebo značky, ne podle obecných slov", () => {
    expect(matchFirm("zkusím se zeptat u Kubíčka v hospodě", firms, [])).toBe(2);
    expect(matchFirm("v Madetě teď nabírají, zavolám tam", firms, [])).toBe(3);
    expect(matchFirm("zeptám se na obecním úřadě", firms, [])).toBeNull();
    expect(matchFirm("zeptám se v hospodě", firms, [])).toBeNull();
  });

  it("příjmení hráče se za firmu nepočítá", () => {
    expect(matchFirm("seženu Novákovi práci", firms, ["Novák"])).toBeNull();
    expect(matchFirm("zeptám se na pile u Nováka", firms, [])).toBe(1);
  });
});

describe("parseJobHelpPromise: trenér hráči slíbí, že se poptá", () => {
  const yes = [
    "Neboj, zkusím se zeptat u sponzorů, někdo určitě někoho shání, ozvu se ti do zítřka",
    "jasne kamo, zeptam se u Kubicka v hospode, ten porad nekoho hleda na vypomoc",
    "Mám jednoho známýho na pile, zavolám mu a dám vědět",
    "To se nějak vyřeší, seženu ti něco, hlavu vzhůru",
  ];
  for (const text of yes) it(`slib: ${text.slice(0, 40)}…`, () => expect(parseJobHelpPromise(text)).toBe(true));

  const no = [
    "Bohužel o ničem nevím, zkus úřad práce nebo inzeráty, sorry",
    "To je blbý, drž se, hlavně přijď v sobotu na zápas",
    "Nevím o ničem, musíš si poradit sám",
  ];
  for (const text of no) it(`bez slibu: ${text.slice(0, 40)}…`, () => expect(parseJobHelpPromise(text)).toBe(false));
});
