/**
 * Pozná hra, že hráč slíbil ozvat se později? Bez toho se nenaplánuje odložená zpráva
 * (follow-ups.ts) a hráč se neozve nikdy. Věty jsou skutečné zprávy hráčů z produkce
 * (9–11/2026), které staré „ozvu se / napíšu pak / zavolám pak“ nepoznalo.
 */
import { describe, expect, it } from "vitest";
import { promisesLater } from "./ai-player-chat";

describe("slib, že se ozve později", () => {
  const promises = [
    // dřívější tvary, ať se nerozbijí
    "Jsem v práci, ozvu se potom.",
    "Teď nemůžu, napíšu ti večer.",
    // „se ozvu“ s časem před slovesem
    "Trenére, jsem v lisu. Zasekla se mi zrnovod, řeším to už druhou hodinu. Pak se ozvu, ok?",
    "Teď musím zpátky k práci, maluju byt, ale pak se ozvu.",
    "Trenére, fakt nevim, jsem v praci, zrovna řídim, nemám čas teď na nějaký detektivky. Zejtra se ozvu. 🚚",
    "Snad jo, chci bejt v základu a urvat to! Teď musím makat, u mašiny hoří termíny, večer se ozvu. 👍",
    "Ještě se ozvu, teď musím řešit pokladnu.",
    "Tak paráda, trenére. Fakt se ozvu, až nebudu točit pivo. 🍻",
    "Jasně, trenére, jak budu mít volno, tak se ozvu. Teď fakt nemůžu. 😂",
    "Nazdar, trenére. Hele, teď fakt nic, jsem v práci a nestíhám! 😤 Pak se ozvu, jestli něco zjistím.",
    // zavolám, až budu mít klid
    "Trenére, v práci je teď blázinec, zákazník chce auto na pondělí. Zavolám, až budu mít klid.",
    "Jsem v lese, zákazník si objednal pokácení, nemůžu odmítnout! Zavolám ti, až budu mít klid, teď fakt ne. 🤬",
    "Trenére, mám teď fičák, orám, vítr se otočil. Zavolám, až budu moct.",
    "Jsem na place a lítám, sotva čumím do mobilu! Zavolám ti hned po směně! 👍",
    "Počítáte se mnou vůbec na jaře? Teď mi tu padá lešení, tak zavolám večer.",
    // cinknu, brnknu
    "Díky trenére, jsem ready na sto pro! 💪 Teď makám v práci a nestíhám, cinknu odpoledne. 😅",
    "Trenére, jsem v hokně a nestíhám! Proberem to v klidu odpoledne, cinknu ti. ⏳",
    "Zdar trenére, jsem fit a kluci taky šlapou, ale teď nestíhám, moštárna bere jen dnes. Cinknu k večeru.",
    "Teď tahám vercajk do osmýho patra, pak brnknu, musím dělat.",
    "Chtěl jsem jen vědět váš názor na mě, brnknu po šichtě.",
    "Teď lítám po sadu a stříkání stromů nepočká, brnknu ti večer.",
    "Zdar trenére, zrovna řežu a čekám na díly, nestíhám. Pohlídám je, neboj. Cinknu ti pak z dílny. 👍",
    "Jasný trenére, vzadu to pošéfuju, ale teď narážím sud a hospoda je plná, cinknu ti k tomu pozdějc.",
    "Mám v práci zásek, jedné babičce tu stříká voda z trubky do bytu 🙈 Cinknu hned, jak to tu zadělám! 🤦‍♂️",
    "Díky trenére, dám do toho všechno! 💪 Teď makám v práci a nestíhám, cinknu před srazem. 😅",
    "Trenére, zkrat v opilosti, mrzí mě to. 🙈 Teď makám a mistr čumí, cinknu vám odpoledne!",
    // napíšu pak / pak napíšu / tak napíšu
    "Jasný, trenére. Hned jak budu moct, tak napíšu. Snad se mi to podaří rychle vyřešit. 😡",
    "Trenére, jsem v práci, nemůžu pořádně psát. Pak napíšu, teď fakt nemůžu od plotny.",
    "Teď řežu v lese a motorovka řve, napíšu víc večer! 😅",
    "Rádo se stalo, trenére! Teď ale fakt musím dělat, mistr čumí. 🙈 Napíšu odpoledne!",
    // dám vědět, ozvat se, proberem to večer
    "Dobře, trenére. Dám vědět, až se uvolním. Dík za pochopení. 🙏",
    "Díky trenére, to je fajn slyšet. Tak si s nima promluvím a dám vědět.",
    "Trenére, jsem v práci, nemůžu teď. Zkusím se ozvat po šichtě, uvidím. Inventura, nemůžu odejít. 😤",
    "Bok trener, proč já zase nehrat? Ted malovat byt, spechat, ozvat se pak!",
    "Trenér, ja vím, ja to myslet vážné. Ale teď ja práce, psat nemoct. Ja ozvat potom, ja? 😎",
    "Ducha? Vykládají mi fošny z náklaďáku a nemám čas, ale Čkyně je prostě lepší adresa. Proberem to večer. 🙄",
    "Trenére, machruje na mladý kluky! Teď musím dodělat řádky, proberem to detailně po šichtě. 🍏",
    // řeknu ti to pak (Jungvirt, lokální E2E 22. 11.)
    "Trenére, mám toho teď moc, řeším tady jízdy. Řeknu ti to večer, jo?",
    "Teď nemůžu, povím ti to pak.",
    // opilý píše bez diakritiky
    "trenere ted nemuzu, napisu pozdejc",
  ];

  for (const text of promises) {
    it(`pozná: ${text.slice(0, 60)}`, () => expect(promisesLater(text)).toBe(true));
  }
});

describe("není to slib, že se ozve", () => {
  const notPromises = [
    // podmínka před slibem
    "Není zač, trenére. Fakt bych nic takovýho neudělal, to by bylo hloupý. Kdyby se něco dělo, hned se ozvu!",
    "Jasný trenére, snad se to vysvětlí bez průseru. Kdybych něco zjistil, dám vědět.",
    "Trenére, mám dobrou zprávu! Včera se mi narodila dcera, Maruška. Kdybychom náhodou slavili, dám vědět.",
    // „dám vědět“ někomu jinému nebo s podmínkou za ním (pátrání má vlastní úkol)
    "Super, trenére, cinknu Tomášovi a kdyby něco, dám vědět. Počítám s tím a těším se! 💪🙈",
    "Jasný trenére, poptám se kluků u piva a dám vědět, kdyby někdo kecal blbosti.",
    "Dám vědět klukům, ať v neděli dorazí dřív.",
    // osobně, ne zprávou
    "Jeden stoper by bodnul trenére. Nejlíp to proberem zítra na tréninku osobně. 🍺",
    "Díky trenére, potěší to! Mám ruce od mletýho, proberem to večer u píva, teď fakt nestíhám.",
    "Trenére, fakt to proberem až budu mít klid? Fajn. Takže nikdy. Čau.",
    // čas bez slibu
    "Díky trenére, to zní dobře! 🍻 Až budu mít volno a po šichtě nebudu tak k.o., tak určitě rád. 💪",
    "Trenére, fakt nevím. Šel jsem kolem později a už tam nikdo nebyl, jen tma.",
    "Trenére, máme dceru! Na trénink teď pár dní nedorazím. Případně vás pak pozvem na panáka.",
    // někomu jinému, nebo něco jiného než odpověď
    "Zavolám mámě, jestli může pohlídat malýho.",
    "Napíšu ti adresu, ať to najdeš.",
    "Trenére, neozvu se, dokud se mi neomluvíš.",
    // „řeknu ti to“ bez času, nebo osobně
    "Řeknu ti to na rovinu, nechci hrát v obraně.",
    "Řeknu ti to večer na tréninku.",
    // trenérova věta „dej vědět“ hráčův slib není
    "Dej vědět, jak to dopadlo.",
  ];

  for (const text of notPromises) {
    it(`nepozná: ${text.slice(0, 60)}`, () => expect(promisesLater(text)).toBe(false));
  }
});
