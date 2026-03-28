"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

interface HelpSection {
  heading?: string;
  text: string;
  tip?: boolean; // rendered as a tip box
}

interface HelpEntry {
  title: string;
  icon: string;
  sections: HelpSection[];
}

// ── Help content per page ──────────────────────────────────

const HELP: Record<string, HelpEntry> = {
  "/dashboard": {
    title: "Domovska obrazovka",
    icon: "\u{1F3E0}",
    sections: [
      { text: "Hlavni prehled klubu \u2014 rozpocet, dalsi zapas, forma, tabulka, stav kadru a trener." },
      { heading: "Forma", text: "V = vyhra (3 body), R = remiza (1 bod), P = prohra (0). Zobrazuje poslednich 5 vysledku." },
      { heading: "Stav kadru", text: "Prumerna kondice ovlivnuje vykon v zapase. Pod 60 % hrozi vyrazne oslabeni tymu. Zraneni hraci nemohou nastoupit." },
      { heading: "Trener", text: "Koucink zvysuje sanci na zlepseni hracu (zaklad 4 %, pri koucink=80 az 5.6 %). Motivace a taktika ovlivnuji zapas. Vlastnosti rostou s kazdym odehranym zapasem (10 % sance na +1)." },
      { text: "Sipky < > v headeru jsou historie prohlizece, NE posouvani dnu. Dny posouvej pres Administraci.", tip: true },
    ],
  },
  "/dashboard/phone": {
    title: "Telefon / Zpravy",
    icon: "\u{1F4F1}",
    sections: [
      { text: "Telefon simuluje komunikaci s hraci a vedenim. Zpravy prichazeji automaticky behem hry." },
      { heading: "Predzapasova konverzace", text: "Den pred zapasem se objevi skupina s nazvem soupere. Hraci odpovidaji, jestli dorazit \u2014 omluveni zavisi na discipline, moralce, dojezdove vzdalenosti a zivotni situaci. Po odehrani zapasu konverzace zmizi." },
      { heading: "Systemove kontakty", text: "Vedeni = finance a hriste. Spravce = zraneni a udrzba. Kapitan = konflikty v kabine. Mistni kontakt = nabidky hracu z okoli." },
      { text: "Nove zpravy od Mistniho kontaktu znamenaji nabidku hrace \u2014 podivej se do Prestupu.", tip: true },
    ],
  },
  "/dashboard/squad": {
    title: "Kadr tymu",
    icon: "\u{1F465}",
    sections: [
      { text: "Vsichni hraci v tymu serazeni podle ratingu. Klikni na jmeno pro detail." },
      { heading: "Rating", text: "Celkove hodnoceni hrace (0\u2013100). Vesnicka uroven je kolem 35\u201340, mestska 40\u201345. Wonderkidi (+15\u201325 bonus) maji sanci 2 % pri generovani." },
      { heading: "Kondice", text: "Regeneruje se denne podle staminy: vysoka stamina (\u226575) = +18/den, nizka (<25) = +7/den. Klesne po zapase a treninku (-3 az -8). Pod 60 % vyrazne snizuje vykon v zapase (az na 0.6x)." },
      { heading: "Moralka", text: "Ovlivnuje vykon. Vyhra da +3 az +7, prohra -2 az -5. Denne se tahi k 50 (nad 55 klesa, pod 45 roste). Prilis nizka moralka + nizky patriotismus = hrozba odchodu hrace." },
      { heading: "Pozice", text: "BRA/OBR/ZAL/UTO. Hrac mimo svou pozici ma az -40 % na relevantni dovednosti. Napr. utocnik v obrane ztraci 30 % obrany." },
    ],
  },
  "/dashboard/training": {
    title: "Treninky",
    icon: "\u26BD",
    sections: [
      { text: "Treninky zlepsuj\u00ED dovednosti hracu. Zakladni sance na zlepseni je 4 % za trenink." },
      { heading: "Koucink trenera", text: "Vzorec: 0.8 + (koucink/100) \u00D7 0.8. Pri koucink 40 = 1.12x, pri 80 = 1.44x. Primo nasobi sanci na zlepseni." },
      { heading: "Vek hrace", text: "Pod 20 let: 1.3x bonus. 20\u201324: 1.15x. 25\u201329: zadny bonus. 30\u201333: 0.7x. 34\u201337: 0.4x. Nad 38: 0.15x. Starsi hraci se zlepsuj\u00ED mnohem pomaleji." },
      { heading: "Rozvoj mladeze", text: "Hraci do 22 let maji extra bonus z vlastnosti trenera: 0.9 + (rozvoj/100) \u00D7 0.6. Pri rozvoj=60 je to 1.26x navic." },
      { heading: "Dochazka", text: "Zavisit na discipline hrace (zaklad: disciplina/100 \u00D7 0.6 + 0.3). Alkohol > 70 snizuje o 10 %. Moralka < 30 snizuje o 15 %. Kazdy km dojezdu snizuje o 0.8 %. Hrac co neprijde ztraci staminu (5 % sance na -1)." },
      { heading: "Pocet treninku/tyden", text: "1x = utery. 2x = ut+ct. 3x = po+st+pa. 4x = po+ut+ct+pa. 5x = vsechny pracovni dny. Vice treninku = vice sanci, ale vyssi naklady a unava hracu." },
      { heading: "Pristup", text: "Prisny: +10 % dochazka, ale hraci s nizkou disciplinou ztraci moralku. Volny: -10 % dochazka, ale +1 moralka (5 % sance). Vyvazeny: bez modifikatoru." },
      { text: "Veterani (37+) maji sanci na pokles fyzickych atributu: (vek-36) \u00D7 1 % na rychlost, staminu, silu.", tip: true },
    ],
  },
  "/dashboard/transfers": {
    title: "Prestupy a nabor",
    icon: "\u{1F91D}",
    sections: [
      { text: "Volni hraci, nabidky a hostovani. V okresu je max 8 volnych hracu, denne pribudou 0\u20132 novi." },
      { heading: "Odkryti hrace", text: "Stoji penize. Ukaze detailni statistiky \u2014 bez odkryti vidis jen pozici a vek. U cizich hracu vidis atributy zaokrouhlene na 5 (rozmazane)." },
      { heading: "Nabidky od Mistniho kontaktu", text: "20 % sance za kolo, ze ti nekdo doporuci hrace (hospoda, mladez, kamarad). Prijde SMS \u2014 hrac se objevi v prestupech." },
      { heading: "Hostovani", text: "Pujcka hrace z jineho tymu na 30\u201390 dni. Hrac se po vyprseni automaticky vrati." },
      { heading: "Kvalita podle velikosti obce", text: "Vesnice: zaklad 37. Obec: 39. Mestys: 41. Mesto: 44. AI tymy maji kvalitu o 1 stupen nizsi." },
      { text: "Platy hracu: 10 + (rating/100) \u00D7 400 Kc/mesic. Hrac s ratingem 50 stoji ~210 Kc/mesic.", tip: true },
    ],
  },
  "/dashboard/finances": {
    title: "Finance klubu",
    icon: "\u{1F4B0}",
    sections: [
      { text: "Rozpocet se meni tydne. Prijmy a vydaje se zpracovavaji kazde pondeli." },
      { heading: "Prijmy", text: "Dotace obce: vesnice 6 000/mes, obec 10 000, mestys 15 000, mesto 25 000 Kc. Sponzori: 1 000\u20138 000/mes podle typu. Prispevky hracu: 100 Kc/hrac/mesic. Vstupne: 10\u201350 Kc/divak." },
      { heading: "Vydaje", text: "Treninky: 200\u20131 000 Kc/trenink (podle velikosti obce). Udrzba hriste: 500\u20133 000/mesic. Rozhodci: 800\u20131 500 Kc/zapas. Cestovne + obcerstveni: 400\u20131 200 Kc/zapas." },
      { heading: "Zapasove odmeny", text: "Vyhra: sponzorsky bonus + 500 Kc liga + fanouskovksy bonus (50\u2013200 Kc). Remiza: 30 % bonusu + 150 Kc. Prohra: nic." },
      { text: "Zaporny rozpocet = nahodne negativni udalosti (kradez, vandalismus, odchod hracu). Udrzuj kladny zustatek!", tip: true },
    ],
  },
  "/dashboard/sponsors": {
    title: "Sponzori",
    icon: "\u{1F3E2}",
    sections: [
      { text: "Sponzori prinaseji mesicni prijem a bonus za vyhru. Pocet nabidek zavisi na velikosti obce (1\u20133)." },
      { heading: "Typy sponzoru", text: "Hospoda: 1 000\u20133 000/mes. Reznictvi/Autoservis: 2 000\u20135 000. Potraviny: 2 500\u20136 000. Obec: 3 000\u20138 000. Kazdy ma jiny bonus za vyhru (150\u2013800 Kc)." },
      { heading: "Reputace", text: "Ovlivnuje kvalitu nabidek. Roste vyhrami, klesa prohrami. Rozsah 0\u2013100." },
    ],
  },
  "/dashboard/equipment": {
    title: "Vybaveni",
    icon: "\u{1F3BD}",
    sections: [
      { text: "Sprava vybaveni klubu. Amortizace vybaveni stoji ~500 Kc/mesic." },
    ],
  },
  "/dashboard/stadium": {
    title: "Stadion a hriste",
    icon: "\u{1F3DF}\uFE0F",
    sections: [
      { text: "Stav hriste ovlivnuje kvalitu hry a riziko zraneni." },
      { heading: "Pocasi", text: "Dest: technika 0.8x, zraneni 1.3x. Snih: technika 0.7x, zraneni 1.4x. Vitr: technika 0.9x. Pocasi se generuje nahodne." },
      { heading: "Navstevnost", text: "Zavisi na velikosti obce, reputaci, pocasi a sile soupere. Vstupne: vesnice 10, obec 20, mestys 30, mesto 50 Kc/divak." },
    ],
  },
  "/dashboard/events": {
    title: "Udalosti",
    icon: "\u{1F4C5}",
    sections: [
      { text: "Nahodne udalosti mezi zapasy. Mohou byt pozitivni i negativni." },
      { heading: "Pozitivni", text: "Sponzorsky dar, dotace od obce, bonus za dobre vysledky. Zvysuji rozpocet nebo reputaci." },
      { heading: "Negativni", text: "Kradez, poskozeni vybaveni, pokuta, vandalismus. Cim nizsi rozpocet, tim vyssi riziko." },
    ],
  },
  "/dashboard/liga": {
    title: "Ligova tabulka",
    icon: "\u{1F3C6}",
    sections: [
      { text: "Tabulka vsech tymu v tve lize. Klikni na nazev pro detail tymu." },
      { heading: "Body", text: "V = 3, R = 1, P = 0. Pri rovnosti bodu rozhoduje skore." },
      { heading: "AI tymy", text: "Pocitacem rizene tymy maji kvalitu o 1 kategorii nizsi nez lidsti hraci. Vesnicke AI = zaklad 35 misto 37." },
    ],
  },
  "/dashboard/calendar": {
    title: "Kalendar sezony",
    icon: "\u{1F4C6}",
    sections: [
      { text: "Mesicni prehled. Zobrazuje treninkove dny, zapasy a volne dny." },
      { heading: "Sezona", text: "Delka sezony je 112 hernich dnu. Zapasy se hraji typicky o vikendech podle rozpisu ligy." },
      { text: "Ve volne dny se hracum regeneruje kondice podle staminy.", tip: true },
    ],
  },
  "/dashboard/match": {
    title: "Detail zapasu",
    icon: "\u26BD",
    sections: [
      { text: "Vysledek, statistiky, sestavy a moznost prehrani." },
      { heading: "Jak funguje zapas", text: "Kazda minuta ma ~10 % sanci na utocnou akci. Sance na gol = zaklad + (utok-obrana)/100. Rozsah 6\u201328 %. Taktika modifikuje: utocna 1.3x utok ale 0.8x obrana." },
      { heading: "Karty", text: "Sance na kartu zavisi na temperamentu a discipline hrace. Kazde 4 zlute = 1 zapas stop. Cervena = okamzity 1 zapas stop." },
      { heading: "Zraneni", text: "~1 % za minutu. Dest 1.3x, snih 1.4x. Horsci stav hriste zvysuje riziko. Zraneni hrac chybi 1\u201312 kol." },
      { text: "Hrac s kondici pod 60 % hraje az na 60 % sveho potencialu. Kondice klesne behem zapasu \u2014 vyrazneji u hracu s nizkou staminou.", tip: true },
    ],
  },
  "/dashboard/news": {
    title: "Zpravodaj",
    icon: "\u{1F4F0}",
    sections: [
      { text: "Ligove zpravy \u2014 vysledky kol, prestupy, udalosti. Generuji se automaticky po kazdem odehranem kole." },
    ],
  },
  "/dashboard/settings": {
    title: "Nastaveni",
    icon: "\u2699\uFE0F",
    sections: [
      { text: "Zmena hesla. Minimalne 8 znaku, velke pismeno, male pismeno, cislo." },
    ],
  },
  "/dashboard/invite": {
    title: "Pozvi kamarada",
    icon: "\u2709\uFE0F",
    sections: [
      { text: "Vygeneruj odkaz a posli ho kamaradovi. Uvidi tvuj tym, obec a pozici v lize. Po registraci se prida do stejneho okresu." },
      { heading: "Jak to funguje", text: "Kamarad klikne na odkaz, uvidi tvoji vyzvu a muze si rovnou zalozit ucet. Automaticky se prida do tve ligy." },
      { text: "Na mobilu pouzij tlacitko Sdilet pro odeslani pres WhatsApp, Messenger nebo jinou aplikaci.", tip: true },
    ],
  },
};

function findHelp(pathname: string): HelpEntry | null {
  if (HELP[pathname]) return HELP[pathname];
  if (pathname.startsWith("/onboarding")) return null;
  if (pathname.startsWith("/dashboard/player/")) return {
    title: "Profil hrace",
    icon: "\u{1F464}",
    sections: [
      { text: "Detailni statistiky, osobnost, zivotni kontext a historie zapasu." },
      { heading: "Dovednosti", text: "7 atributu: rychlost, technika, strelba, prihravky, hlavicky, obrana, brankar. Zlepsuj\u00ED se treninkem (4 % zaklad, az 7 % s bonusy). Nad 50 bodu se zlepseni zpomaluje (diminishing returns)." },
      { heading: "Osobnost", text: "Disciplina = dochazka na treninky. Patriotismus = loajalita ke klubu. Temperament = riziko karet. Alkohol > 70 = -10 % dochazka a vyssi unava v zapase (+0.15 kondice/min)." },
      { heading: "Zivotni kontext", text: "Zamestnani a rodina ovlivnuji dostupnost. Ridic kamionu nebo oteec malych deti muze casteji chybet. Dojezdova vzdalenost snizuje dochazku o 0.8 %/km." },
      { text: "Sipky v headeru posouvaji mezi hraci TOHO TYMU, kteremu hrac patri.", tip: true },
    ],
  };
  if (pathname.startsWith("/dashboard/team/")) return {
    title: "Profil tymu",
    icon: "\u{1F3DF}\uFE0F",
    sections: [
      { text: "Detail tymu \u2014 kadr, vysledky, statistiky. Klikni na hrace pro jeho profil." },
      { heading: "Cizi hraci", text: "U hracu cizich tymu vidis atributy zaokrouhlene na 5 (rozmazane). Pro presne hodnoty musis hrace odkryt v prestupech." },
    ],
  };
  if (pathname.match(/\/dashboard\/match\/[^/]+$/)) return HELP["/dashboard/match"];
  if (pathname.includes("/replay")) return {
    title: "Prehrani zapasu",
    icon: "\u25B6\uFE0F",
    sections: [
      { text: "Textovy komentar minuta po minute. Goly, sance, fauly, karty, stridani." },
      { heading: "Prubeh", text: "Kazda minuta se simuluje zvlast. Utocne akce, drzeni mice, specialni udalosti. O polocase se hracum obnovit +5 kondice." },
      { text: "Goly v poslednich 15 minutach jsou ovlivneny clutch atributem hrace (0.9\u20131.1x modifikator).", tip: true },
    ],
  };
  if (pathname.match(/\/dashboard\/phone\/.+/)) return {
    title: "Konverzace",
    icon: "\u{1F4AC}",
    sections: [
      { text: "Zpravy od hracu a vedeni. Systemove zpravy jsou informacni." },
      { heading: "Dochazka", text: "V predzapasove konverzaci hraci odpovidaji, jestli dorazit. Odpoved zavisi na discipline, moralce, alkoholu, dojezdu a zamestnani. Nekteri se omluvi, nekteri dorazit pozde." },
    ],
  };
  return null;
}

// ── Shared UI components ───────────────────────────────────

function HelpPanel({ help, onClose }: { help: HelpEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed bottom-[5.5rem] sm:bottom-20 left-3 right-3 sm:left-auto sm:right-4 z-50 sm:w-[360px] max-h-[55vh] sm:max-h-[70vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-100 animate-slide-up">
        <div className="sticky top-0 bg-pitch-700 text-white px-5 py-3 rounded-t-xl flex items-center gap-3">
          <span className="text-xl">{help.icon}</span>
          <span className="font-heading font-bold text-base">{help.title}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {help.sections.map((s, i) => (
            <div key={i} className={s.tip ? "bg-pitch-50 border border-pitch-200 rounded-lg px-3 py-2" : ""}>
              {s.heading && (
                <h4 className="font-heading font-bold text-sm text-pitch-700 mb-0.5">{s.heading}</h4>
              )}
              <p className={`text-sm leading-relaxed ${s.tip ? "text-pitch-800" : "text-gray-700"}`}>
                {s.tip && "\u{1F4A1} "}
                {s.text}
              </p>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Klikni kamkoliv mimo pro zavreni
        </div>
      </div>
    </>
  );
}

function HelpButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`fixed z-50 w-11 h-11 rounded-full bg-pitch-700 text-white shadow-lg hover:bg-pitch-600 transition-all flex items-center justify-center font-heading font-bold text-lg ${className ?? "bottom-24 sm:bottom-6 right-4"}`}
      title="Napoveda"
      aria-label="Napoveda"
    >
      {open ? "\u2715" : "?"}
    </button>
  );
}

// ── Exports ────────────────────────────────────────────────

export function Napoveda() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const help = findHelp(pathname);
  if (!help) return null;

  return (
    <>
      <HelpButton open={open} onClick={() => setOpen(!open)} />
      {open && <HelpPanel help={help} onClose={() => setOpen(false)} />}
    </>
  );
}

export function NapovedaOnboarding({ step }: { step: string }) {
  const [open, setOpen] = useState(false);

  const stepHelp: Record<string, HelpEntry> = {
    location: {
      title: "Vyber obce",
      icon: "\u{1F4CD}",
      sections: [
        { text: "Vyber si obec, kde zalozis svuj klub. Velikost obce urcuje startovni podminky." },
        { heading: "Vesnice (do 500 ob.)", text: "Zaklad hracu: 37. Rozpocet: nejmensi. Treninky: 200 Kc. Dotace: 6 000/mes. Ale nejslabsi souperi!" },
        { heading: "Obec (500\u20132 000)", text: "Zaklad: 39. Treninky: 400 Kc. Dotace: 10 000/mes. Vyvazeny start." },
        { heading: "Mestys (2 000\u20135 000)", text: "Zaklad: 41. Treninky: 600 Kc. Dotace: 15 000/mes. Silnejsi liga." },
        { heading: "Mesto (5 000+)", text: "Zaklad: 44. Treninky: 1 000 Kc. Dotace: 25 000/mes. Nejsilnejsi souperi." },
        { text: "Vsechny tymy ve tve lize budou ze stejneho okresu. AI tymy maji kvalitu o 1 stupen nizsi nez ty.", tip: true },
      ],
    },
    manager: {
      title: "Profil trenera",
      icon: "\u{1F9D1}\u200D\u{1F4BC}",
      sections: [
        { text: "Trenera pojmenuj a vyber mu pribeh. Pribeh urcuje startovni bonusy." },
        { heading: "Koucink", text: "Zvysuje sanci na zlepseni hracu pri treninku. Zakladni sance je 4 %, pri koucink 80 az 5.6 %." },
        { heading: "Motivace", text: "Ovlivnuje moralku tymu a vykon v zapase." },
        { heading: "Taktika", text: "Pridava bonus k dovednostem v zapase (+1\u20135 podle urovne)." },
        { heading: "Disciplina", text: "Ovlivnuje reakce hracu na prisny trenink." },
        { text: "Vlastnosti trenera rostou s kazdym odehranym zapasem (10 % sance na +1 k nahodnemu atributu).", tip: true },
      ],
    },
    club: {
      title: "Nazev klubu",
      icon: "\u{1F3DF}\uFE0F",
      sections: [
        { text: "Zvol nazev klubu a stadionu. Klasicke ceske nazvy: SK, FK, TJ, Sokol, Spartak..." },
        { heading: "Sponzor", text: "Dostanes nabidku od mistniho sponzora. Prijem 1 000\u20138 000 Kc/mesic + bonus za vyhru. Lepsi nabidky prisou s vyssi reputaci." },
      ],
    },
    team: {
      title: "Barvy a dres",
      icon: "\u{1F3BD}",
      sections: [
        { text: "Vyber primarni a sekundarni barvu dresu a vzor." },
        { text: "Barvy se zobrazi v zapasech, v tabulce a na profilu tymu. Vzor dresu je jen vizualni.", tip: true },
      ],
    },
    reveal: {
      title: "Tvuj tym",
      icon: "\u{1F31F}",
      sections: [
        { text: "Vygenerovany kadr. Kazdy hrac ma unikatni osobnost, zamestnani a schopnosti." },
        { heading: "Rating", text: "Vesnice: kolem 35\u201340. Mesto: 40\u201345. Wonderkid (2 % sance, vek \u226421): +15\u201325 navic!" },
        { heading: "Osobnost", text: "Disciplina urcuje dochazku. Patriotismus loajalitu. Alkohol unavu a absenci. Temperament riziko karet." },
        { text: "Po dokonceni zacni posouvat dny. Treninky jsou ut+ct (2x/tyden). Prvni zapas bude o vikendu.", tip: true },
      ],
    },
  };

  const help = stepHelp[step];
  if (!help) return null;

  return (
    <>
      <HelpButton open={open} onClick={() => setOpen(!open)} className="bottom-20 right-4" />
      {open && <HelpPanel help={help} onClose={() => setOpen(false)} />}
    </>
  );
}
