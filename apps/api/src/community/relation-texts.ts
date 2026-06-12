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

export interface RelationNames {
  myName: string;      // název mého klubu
  theirName: string;   // název soupeřova klubu
  myManager: string;   // jméno mého trenéra
  theirManager: string; // jméno soupeřova trenéra
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ────────────────────────────────────────────────────────────────────────────
// Předzápasové výroky do novin
// ────────────────────────────────────────────────────────────────────────────

export function statementRespectQuote(n: RelationNames): string {
  return pick([
    `„${n.theirName} hraje nejlepší fotbal od Libína po Boubín. Bude to dřina a my to víme,“ řekl před zápasem trenér ${n.myManager} (${n.myName}).`,
    `„Trenér ${n.theirManager} odvádí poctivou práci. Tohle bude zápas, na který má přijít celá náves,“ uznal kvality soupeře trenér ${n.myManager} z ${n.myName}.`,
    `„Mají formu jak borůvky v červenci. Jestli nebudeme stoprocentní, odvezeme si nášup,“ smekl před soupeřem trenér ${n.myManager} (${n.myName}).`,
    `„Před ${n.theirName} klobouk dolů. Ale v neděli se to rozdá férově na trávě, ne v novinách,“ vzkázal trenér ${n.myManager} z ${n.myName}.`,
    `„Jejich záloha šlape jak hodiny na prachatický věži. Musíme je vypnout dřív, než se rozjedou,“ chválil soupeře trenér ${n.myManager} (${n.myName}).`,
    `„Znám jejich kluky z brigád i z hospody. Poctiví chlapi, poctivej fotbal. Těším se na ně,“ řekl trenér ${n.myManager} z ${n.myName}.`,
    `„Kdyby se okres hrál jen na srdce, ${n.theirName} už dávno slaví titul. Naštěstí se hraje i na nohy,“ uznale pokýval hlavou trenér ${n.myManager} (${n.myName}).`,
  ]);
}

export function statementProvokeQuote(n: RelationNames): string {
  return pick([
    `„${n.theirName}? Ti by neuhlídali ani kozu na návsi, natož náš útok,“ provokoval před zápasem trenér ${n.myManager} (${n.myName}).`,
    `„Viděl jsem o víkendu v lese hřiby, co měly lepší postavení než jejich obrana,“ rýpl si do soupeře trenér ${n.myManager} z ${n.myName}.`,
    `„Jejich hřiště zná každej kanec ze Šumavy. Taky si na něm ryje, kdo chce,“ vzkázal směrem k ${n.theirName} trenér ${n.myManager}.`,
    `„Půlka jejich sestavy hraje fotbal jen na pouti. A druhá půlka ani to ne,“ nebral si servítky trenér ${n.myManager} (${n.myName}).`,
    `„Prej trénujou presink. Zatím stíhaj presovat akorát zelí,“ bavil se na účet soupeře trenér ${n.myManager} z ${n.myName}.`,
    `„Bečku ať chladí předem. A pořádnou, ne tu jejich břečku,“ hlásil sebevědomě trenér ${n.myManager} (${n.myName}).`,
    `„Jejich trenér má taktiku z dob, kdy se ještě psalo křídou na vrata kravína,“ provokoval kolegu trenér ${n.myManager} z ${n.myName}.`,
    `„Na Zlatý stezce se odjakživa obchodovalo se solí. My jim v neděli osolíme,“ sliboval trenér ${n.myManager} (${n.myName}).`,
    `„${n.theirManager} říká, že mají formu. Jo, formu na buchty,“ neodpustil si trenér ${n.myManager} z ${n.myName}.`,
    `„Slyšel jsem, že přes léto posilovali. Asi ten plot kolem hřiště,“ ušklíbl se trenér ${n.myManager} (${n.myName}).`,
  ]);
}

export function statementHumbleQuote(n: RelationNames): string {
  return pick([
    `„Jedeme oslabení, půlka kádru má žně a druhá kocovinu z poutě,“ krotil očekávání trenér ${n.myManager} (${n.myName}).`,
    `„${n.theirName} je jasnej favorit. My vezeme akorát dobrou náladu a rezervní dresy,“ tvrdil skromně trenér ${n.myManager} z ${n.myName}.`,
    `„Když to nebude debakl, dám klukům bečku. Víc fakt neslibuju,“ hrál chudáčka trenér ${n.myManager} (${n.myName}).`,
    `„Náš cíl? Vrátit se v jednom kuse a stihnout večerní dojení. Body neřešíme,“ mávl rukou trenér ${n.myManager} z ${n.myName}.`,
    `„Gólman má namožený záda ze sena a stoper hlídá doma krávy. Jedeme to odchodit,“ stěžoval si trenér ${n.myManager} (${n.myName}).`,
    `„Proti ${n.theirName} jedeme maximálně pro kanára a dobrou klobásu,“ nečekal nic trenér ${n.myManager} z ${n.myName}.`,
    `„My letos hrajeme o záchranu dobré nálady. Nic víc v plánu není,“ mlžil trenér ${n.myManager} (${n.myName}).`,
  ]);
}

// ── AI protivyroky podle archetypu ──────────────────────────────────────────

export type StatementToneText = "respect" | "provoke" | "humble";

export function counterQuoteText(
  archetype: "provokater" | "urazeny" | "ferovka" | "pohodar",
  tone: StatementToneText,
  n: RelationNames,
): string | null {
  switch (archetype) {
    case "provokater":
      if (tone === "provoke") {
        return pick([
          `„${n.myName}? Ať si nejdřív spočítaj vlastní góly. My jim v neděli pár přidáme,“ kontroval okamžitě trenér ${n.theirManager} z ${n.theirName}.`,
          `„Velký řeči od mužstva, který naposledy něco vyhrálo v tombole,“ vystřelil zpátky trenér ${n.theirManager} (${n.theirName}).`,
          `„Jestli hrajou fotbal tak dobře, jak mluví do novin, tak se těším. Zatím teda mluví líp,“ opáčil trenér ${n.theirManager} z ${n.theirName}.`,
        ]);
      }
      return pick([
        `„Hezky mluví. Na hřišti se ale mluvit nebude,“ rýpl si i přes vstřícná slova trenér ${n.theirManager}.`,
        `„Pochvala od nich? To budou chtít nejspíš půjčit lajnovačku,“ zavětřil trenér ${n.theirManager} z ${n.theirName}.`,
      ]);
    case "urazeny":
      if (tone === "provoke") {
        return pick([
          `Trenér ${n.theirManager} se proti výrokům ostře ohradil: „Tohle se mezi slušnejma klubama nedělá. Řekl jsem redakci svoje a víc to komentovat nebudu.“ Podle našich informací to komentoval ještě dlouho.`,
          `„Já si tyhle věci pamatuju. A kluci v kabině taky,“ vzkázal dotčeně trenér ${n.theirManager} (${n.theirName}) a práskl za sebou dveřmi kabiny.`,
        ]);
      }
      return null;
    case "ferovka":
      if (tone === "respect") {
        return pick([
          `„Slušnost se na okrese pořád cení. I my si jich vážíme a v neděli to bude férovej fotbal,“ odpověděl trenér ${n.theirManager}.`,
          `„Takhle se má mluvit o soupeři. Přijďte se podívat, tohle bude fotbal jak má bejt,“ opětoval uznání trenér ${n.theirManager} z ${n.theirName}.`,
        ]);
      }
      if (tone === "provoke") {
        return pick([
          `„Nebudu se snižovat k přestřelkám v novinách. Odpovíme na hřišti,“ řekl klidně trenér ${n.theirManager}.`,
          `„Každej se prezentuje, jak umí. My umíme fotbal,“ odpověděl suše trenér ${n.theirManager} z ${n.theirName}.`,
        ]);
      }
      return null;
    case "pohodar":
      if (tone === "provoke") {
        return pick([
          `„Dobrý, ne? Aspoň přijde víc lidí,“ smál se trenér ${n.theirManager} a pozval kolegu po zápase na pivo.`,
          `„Já se urazit nestihnu, máme zrovna seno,“ pokrčil rameny trenér ${n.theirManager} z ${n.theirName}.`,
        ]);
      }
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anonymní inzeráty
// ────────────────────────────────────────────────────────────────────────────

export function adTextFor(n: RelationNames): string {
  const goals = Math.floor(Math.random() * 5) + 5;
  return pick([
    `Prodám obranu, málo používaná, projeto ${goals} góly. Zn.: ${n.theirName}`,
    `Hledá se útočník. Naposledy viděn střílet na bránu o pouti. Odměna: pivo. Zn.: ${n.theirName}`,
    `Vyměním tři body za cokoliv. I za slepice. Zn.: ${n.theirName}`,
    `Daruji taktickou tabuli, zánovní, majitel ji stejně nepoužívá. Zn.: kabina ${n.theirName}`,
    `Koupím góly. Levně. Spěchá. Zn.: ${n.theirName}`,
    `Pronajmu vlastní vápno. Soupeři ho stejně využívají víc než my. Zn.: ${n.theirName}`,
    `Ztratil se herní projev. Naposledy viděn loni na podzim u Blanice. Poctivému nálezci bečka. Zn.: ${n.theirName}`,
    `Prodám síť z brány, prošoupaná zevnitř. Skoro nová zvenku. Zn.: brankář ${n.theirName}`,
    `Nabízím kondiční přípravu mužstvu, které nedoběhne ani poslední autobus na Prachatice. Zn.: dobrá duše`,
    `Sháním stopera, co se nebojí. Ti naši se bojí i vlastního gólmana. Zn.: ${n.theirName}`,
    `Prodám kopačky, 11 párů, používané jen na stání. Zn.: záloha ${n.theirName}`,
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pozápasové rýpnutí do novin (gesto jab)
// ────────────────────────────────────────────────────────────────────────────

export function jabNewsBody(n: RelationNames): string {
  return pick([
    `„Soupeř? Viděli jste to sami. My jsme aspoň věděli, na kterou stranu se útočí,“ nechal se slyšet trenér ${n.myName} na adresu ${n.theirName}. V kabině ${n.myName} se prý smáli ještě u třetího piva.`,
    `„Kdyby se body dávaly za řeči, jsou mistři okresu už v srpnu,“ rýpl si po zápase trenér ${n.myName} do ${n.theirName}.`,
    `„Poděkoval bych jim za zápas, ale ono se vlastně nic nekonalo,“ glosoval utkání s ${n.theirName} trenér ${n.myName}. Slyšet to bylo prý až na náves.`,
    `„Jejich největší šance dneska? Že stihnou poslední rundu v hospodě,“ utrousil směrem k ${n.theirName} trenér ${n.myName}.`,
    `„Hráli jsme proti jedenácti kuželkám. Aspoň že se nekácely samy,“ neodpustil si trenér ${n.myName} na účet ${n.theirName}.`,
    `„Na Šumavě se říká: kdo nic neumí, ať aspoň fauluje. Oni dneska zvládli obojí naopak,“ vzkázal po zápase ${n.theirName} trenér ${n.myName}.`,
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pochvala — odpovědi AI trenérů
// ────────────────────────────────────────────────────────────────────────────

export function praiseReplyText(
  archetype: "provokater" | "urazeny" | "ferovka" | "pohodar",
  n: RelationNames,
): string {
  switch (archetype) {
    case "ferovka":
      return pick([
        `${n.theirManager}: „Tohle potěší. Pozdravuj u vás v kabině.“`,
        `${n.theirManager}: „Děkuju. Poctivá práce se na okrese pozná — u vás taky.“`,
      ]);
    case "pohodar":
      return pick([
        `${n.theirManager}: „No vidíš — a pivo z toho jednou bude.“`,
        `${n.theirManager}: „Jo? Tak to zapijeme, až pojedeš kolem. Stavíme se u stánku.“`,
      ]);
    case "urazeny":
      return pick([
        `${n.theirManager}: „Hm. A co tím jako myslel?“ Ale podle všeho ho to potěšilo.`,
        `${n.theirManager} dlouho mlčel a pak zabručel: „No… to je od něj hezký.“ Pochvalu si prý vystřihl z novin.`,
      ]);
    case "provokater":
      return pick([
        `${n.theirManager}: „Jasně že dělám dobrou práci. Aspoň někdo na okrese to vidí.“`,
        `${n.theirManager}: „Konečně někdo s vkusem. Škoda že mu to v neděli budeme muset zkazit.“`,
      ]);
  }
}

export function praiseNews(n: RelationNames): { headline: string; body: string } {
  return pick([
    {
      headline: "Pochvala přes celý okres",
      body: `„${n.theirManager} odvádí v ${n.theirName} poctivou práci. To se musí umět ocenit i u konkurence,“ vzkázal kolegovi trenér ${n.myManager} z ${n.myName}. Na okrese, kde se víc pomlouvá než chválí, je to zpráva sama o sobě.`,
    },
    {
      headline: `${n.myManager} smeká před kolegou`,
      body: `Trenér ${n.myName} veřejně pochválil práci, kterou ${n.theirManager} dělá v ${n.theirName}: „Klobouk dolů, takhle se vede mančaft.“ Slušnost na okrese nevymřela.`,
    },
    {
      headline: "Mezi trenéry to (kupodivu) vře respektem",
      body: `„Co ${n.theirManager} dokázal s ${n.theirName}, by mu mohl závidět kdekdo od Blanice po Boubín,“ nechal se slyšet trenér ${n.myManager} (${n.myName}). Hospodští štamgasti nevěří vlastním uším.`,
    },
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pivo a šipky
// ────────────────────────────────────────────────────────────────────────────

export function beerSceneText(n: RelationNames): string {
  return pick([
    `Dobrý večer u piva s trenérem ${n.theirName}. Probralo se všechno od rozhodčích po ceny chmele.`,
    `Dvě hodiny, tři piva a historky z vojny. S trenérem ${n.theirName} se vztahy budujou jedině takhle.`,
    `U výčepu jste s trenérem ${n.theirName} vyřešili sestavu reprezentace i to, kdo komu v devadesátým osmým ukopl kotník. Smích do zavíračky.`,
    `Trenér ${n.theirName} platil druhou rundu a u třetí už jste si tykali. Hospoda si vás fotila — tohle se na okrese nevidí.`,
    `Večer s trenérem ${n.theirName} skončil zpěvem u jukeboxu. Hospodský tvrdí, že horší duo neslyšel, ale srdce to mělo.`,
  ]);
}

export function dartsWinText(n: RelationNames): string {
  return pick([
    `Došlo i na šipky — a ${n.theirManager} kupoval rundu. Tohle se bude vyprávět.`,
    `Šipky: tři kola, jasná věc. ${n.theirManager} platil rundu a mumlal něco o rozházené sedmičce.`,
    `V šipkách jsi ho rozebral jak nedělní kuře. ${n.theirManager} zaplatil rundu a chce odvetu.`,
  ]);
}

export function dartsLossText(n: RelationNames): string {
  return pick([
    `Šipky nevyšly — runda šla za tebou. ${n.theirManager} se usmíval celej večer.`,
    `${n.theirManager} házel šipky, jako by celej život nedělal nic jinýho. Runda tě stála kus výplaty i hrdosti.`,
    `V šipkách tě sundal levou zadní. Hospoda tleskala, ty jsi platil.`,
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Štamtiš trenérů (skupinové pivo)
// ────────────────────────────────────────────────────────────────────────────

export function stammtischNews(hostManager: string, hostTeam: string, attendeeNames: string[]): { headline: string; body: string } {
  const guests = attendeeNames.join(", ");
  return pick([
    {
      headline: "Trenérský summit v hospodě",
      body: `Trenér ${hostManager} (${hostTeam}) svolal ke svému stolu kolegy z okresu: ${guests}. Co se domlouvalo u čtvrté rundy, se redakce nedozvěděla — ale když sedí tolik trenérů u jednoho stolu, fanoušci mají právo spekulovat. Přestupy? Spiknutí proti lídrovi tabulky? Nebo jen mariáš?`,
    },
    {
      headline: "U jednoho stolu celý přebor",
      body: `V hospodě se sešla trenérská elita okresu: ${hostManager} hostil kolegy (${guests}). Štamgasti hlásí, že se hlasitě smálo, dvakrát přísahalo na ofsajd a jednou málem došlo na ručníky. Okresní fotbal se nehraje jen na trávě.`,
    },
    {
      headline: "Trenéři pili, okres šumí",
      body: `Trenér ${hostManager} z ${hostTeam} zaplatil rundy kolegům: ${guests}. „Nic jsme nedomlouvali, jen jsme probrali rozhodčí,“ tvrdí účastníci jednohlasně. Tak jednohlasně, že tomu nikdo nevěří.`,
    },
  ]);
}

export function stammtischQuarrelText(mgrA: string, mgrB: string): string {
  return pick([
    `${mgrA} a ${mgrB} se chytli kvůli ofsajdu z minulé sezóny — létaly tácky a ${mgrB} odešel před poslední rundou`,
    `Mezi ${mgrA} a ${mgrB} to u stolu zajiskřilo: začalo to penaltou z jara a skončilo převrženou židlí`,
    `${mgrA} připomněl ${mgrB} prohranou bečku — a bylo zle. Hospodský je musel posadit každého na jiný konec stolu`,
  ]);
}

export function stammtischDeclineText(
  archetype: "provokater" | "urazeny" | "ferovka" | "pohodar",
  manager: string,
): string {
  switch (archetype) {
    case "urazeny":
      return pick([
        `${manager} pozvánku odmítl. Vzkázal, že „ví, co si o něm u toho stolu myslí“.`,
        `${manager} nepřišel. Prý měl „něco s králíkama“, ale všichni vědí, že se pořád zlobí.`,
      ]);
    case "ferovka":
      return `${manager} se slušně omluvil — bez vzájemného respektu prý ke stolu nesedá.`;
    default:
      return `${manager} nedorazil.`;
  }
}

export function stammtischSceneText(attendeeCount: number): string {
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

// ────────────────────────────────────────────────────────────────────────────
// Runda pro celou hospodu
// ────────────────────────────────────────────────────────────────────────────

export function pubRoundMessage(patrons: number): string {
  return pick([
    `Hospodský třikrát přepočítal půllitry: ${patrons} štamgastů zvedlo sklenici na tvoje zdraví. Tohle se ve vsi nezapomíná.`,
    `Runda pro všech ${patrons} přítomných! Hospoda zaburácela, někdo začal zpívat a starosta si připil dvakrát.`,
    `${patrons} pív na tvůj účet — a celá hospoda náhle ví, kdo vyhrál víkendový zápas. Sláva vítězům.`,
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Dárkové koše
// ────────────────────────────────────────────────────────────────────────────

export function giftSincereMessage(): string {
  return pick([
    "Koš s lahví a upřímnou kartičkou odeslán. Tohle se na okrese počítá.",
    "Koš s domácí slivovicí a vzkazem „Hlavu vzhůru“ je na cestě. Gesto, který se nezapomíná.",
    "Poslal jsi koš s medem, klobásou a poctivým vzkazem. Na vsi se o tom bude mluvit v dobrým.",
  ]);
}

export function giftPoisonMessage(): string {
  return pick([
    "Koš s kartičkou „Ať se daří aspoň v hospodě“ odeslán. Kabina si fotku přeposílá dodnes.",
    "Koš s kartičkou „Přikládáme míč, ať si na něj zvyknou“ je na cestě. Kabina řve smíchy.",
    "Odeslán koš s pytlíkem kanárků a vzkazem „Krmení na příště“. Tohle ti nezapomenou.",
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Sázky o bečku — články
// ────────────────────────────────────────────────────────────────────────────

export function betWonNews(winnerName: string, loserName: string, score: string): { headline: string; body: string } {
  return pick([
    {
      headline: `${loserName} prohrál bečku`,
      body: `Trenéři se před zápasem vsadili o bečku piva. Po výsledku ${score} platí trenér ${loserName} — v hospodě ${winnerName} se dnes slaví dvakrát.`,
    },
    {
      headline: `Bečka mění majitele`,
      body: `Předzápasová sázka trenérů má vítěze. ${winnerName} bere body i bečku, trenér ${loserName} u výčepu jen tiše počítal útratu. Výsledek ${score} mu připomínat nemusíme — postará se o to celá náves.`,
    },
    {
      headline: `Nejdražší pivo na okrese`,
      body: `Trenér ${loserName} se vsadil o bečku a po výsledku ${score} platí. „Příště se vsadím leda o zelňačku,“ ulevil si prý cestou z hřiště. V ${winnerName} už chladí sklenice.`,
    },
  ]);
}

export function betDrawNews(homeName: string, awayName: string, score: string): { headline: string; body: string } {
  return pick([
    {
      headline: "Sázka o bečku skončila remízou",
      body: `Trenéři ${homeName} a ${awayName} se vsadili o bečku — jenže zápas skončil ${score}. Bečka zůstává v hospodě a čeká na odvetu.`,
    },
    {
      headline: "Bečka zůstává za výčepem",
      body: `Remíza ${score} mezi ${homeName} a ${awayName} nechala předzápasovou sázku bez vítěze. Hospodský prý bečku označil fixou a hlídá ji do odvety.`,
    },
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Derby a falešná skromnost — články
// ────────────────────────────────────────────────────────────────────────────

export function derbyNews(homeName: string, awayName: string, winnerName: string, score: string): { headline: string; body: string } {
  return pick([
    {
      headline: `DERBY: ${homeName} ${score} ${awayName}`,
      body: `${winnerName} ovládl derby plné emocí. V hospodě vítězů se slaví, u poražených se dnes mlčí a leští se kosa na příště.`,
    },
    {
      headline: `Derby pro ${winnerName}!`,
      body: `Zápas, o kterém se na návsi mluvilo celý týden, skončil ${score}. ${winnerName} má rok klid u piva — poražení budou každou narážku polykat až do odvety.`,
    },
    {
      headline: `${winnerName} bere derby a náves k tomu`,
      body: `Výsledek ${score} rozhodl o tom, kdo bude rok chodit po vsi s hlavou nahoře. Vítězná hospoda dolévala do rána, ta druhá zavřela dřív.`,
    },
  ]);
}

export function humbleBackfireNews(actorName: string, actorManager: string, targetName: string, score: string): { headline: string; body: string } {
  return pick([
    {
      headline: "Skromnost, která bolela",
      body: `Trenér ${actorManager} (${actorName}) celý týden tvrdil, jak jedou jen důstojně prohrát. Pak jeho tým vyhrál ${score}. V ${targetName} se o „skromnosti“ kolegy mluví slovy, která nelze otisknout.`,
    },
    {
      headline: `Chudáček z ${actorName} bral všechno`,
      body: `„Jedeme oslabení, nic nečekáme.“ Výsledek ${score} ukázal, co byla předzápasová slova trenéra ${actorManager} zač. V ${targetName} mají od neděle nový důvod trénovat — a nový důvod nezapomínat.`,
    },
    {
      headline: "Žně skončily, počítají se góly",
      body: `Před zápasem půlka kádru ${actorName} údajně svážela seno. Na hřišti pak svezli soupeře ${score}. Trenér ${targetName} k tomu řekl jen: „Tak žně, jo?“`,
    },
  ]);
}
