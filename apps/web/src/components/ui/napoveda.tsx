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
// Texty píšeme česky včetně diakritiky — nápověda je místo, kam hráč jde,
// když si není jistý, a psaní bez háčků tam působí nedodělaně.

const HELP: Record<string, HelpEntry> = {
  "/dashboard": {
    title: "Domovská obrazovka",
    icon: "\u{1F3E0}",
    sections: [
      { text: "Hlavní přehled klubu — rozpočet, další zápas, forma, tabulka, stav kádru a trenér." },
      { heading: "Skládání dashboardu", text: "Tlačítkem Upravit dashboard přepneš stránku do editace. Widget pak chytneš za jeho zelenou lištu a přetáhneš myší nebo prstem kam potřebuješ; šipky dělají to samé po jednom kroku. Křížek widget odebere, čísla 1/2/3 nastaví šířku ve sloupcích (na mobilu je vždy jeden sloupec). Tlačítko Přidat widget otevře katalog s grafy, koláči, radary a žebříčky — vybrat jich můžeš víc naráz. Hotovo uloží rozložení na server, takže ti drží i na jiném zařízení. Obnovit výchozí vrátí původní podobu." },
      { text: "Widgety se sesypávají nahoru, takže menší karta zaplní místo pod vyšším sousedem a nikde nezůstávají prázdná místa.", tip: true },
      { heading: "Forma", text: "V = výhra (3 body), R = remíza (1 bod), P = prohra (0). Zobrazuje posledních 5 výsledků." },
      { heading: "Stav kádru", text: "Průměrná kondice ovlivňuje výkon v zápase. Pod 60 % hrozí výrazné oslabení týmu. Zranění hráči nemohou nastoupit." },
      { heading: "Trenér", text: "Koučink násobí šanci na zlepšení hráčů při tréninku. Motivace před zápasem zvedne morálku celému kádru (při 60 o tři body), taktika přidá přihrávky a obranu (od 60 o bod). Vlastnosti se vyvíjejí obousměrně: koučink a taktika rostou častěji po výhře, prohra občas srazí motivaci. Reputace roste za výhry a klesá za prohry." },
      { text: "Šipky < > v hlavičce jsou historie prohlížeče, NE posouvání dnů. Dny posouvej přes Administraci.", tip: true },
    ],
  },
  "/dashboard/phone": {
    title: "Telefon / Zprávy",
    icon: "\u{1F4F1}",
    sections: [
      { text: "Telefon simuluje komunikaci s hráči a vedením. Zprávy přicházejí automaticky během hry." },
      { heading: "Předzápasová konverzace", text: "Den před zápasem se objeví skupina s názvem soupeře. Hráči odpovídají, jestli dorazí — omluvení závisí na disciplíně, morálce, dojezdové vzdálenosti a životní situaci. Po odehrání zápasu konverzace zmizí." },
      { heading: "Systémové kontakty", text: "Vedení = finance a hřiště. Správce = zranění a údržba. Kapitán = konflikty v kabině. Místní kontakt = nabídky hráčů z okolí." },
      { text: "Nové zprávy od Místního kontaktu znamenají nabídku hráče — podívej se do Přestupů.", tip: true },
    ],
  },
  "/dashboard/squad": {
    title: "Kádr týmu",
    icon: "\u{1F465}",
    sections: [
      { text: "Všichni hráči v týmu seřazení podle ratingu. Klikni na jméno pro detail." },
      { heading: "Rating", text: "Celkové hodnocení hráče (0–100). Vesnická úroveň je kolem 35–40, městská 40–45. Wonderkidi (+15–25 bonus) mají šanci 2 % při generování." },
      { heading: "Kondice", text: "Regeneruje se denně podle staminy: vysoká stamina (≥75) = +18/den, nízká (<25) = +7/den. Klesne po zápase a tréninku (−3 až −8). Pod 60 % výrazně snižuje výkon v zápase (až na 0,6×)." },
      { heading: "Morálka", text: "Ovlivňuje výkon. Výhra dá +3 až +7, prohra −2 až −5. Denně se táhne k 50 (nad 55 klesá, pod 45 roste). Příliš nízká morálka + nízký patriotismus = hrozba odchodu hráče." },
      { heading: "Pozice", text: "BRA/OBR/ZÁL/ÚTO. Hráč mimo svou pozici má až −40 % na relevantní dovednosti. Např. útočník v obraně ztrácí 30 % obrany." },
    ],
  },
  "/dashboard/training": {
    title: "Tréninky",
    icon: "⚽",
    sections: [
      { text: "Tréninky zlepšují dovednosti hráčů. Základní šance na zlepšení je 10 % za jeden trénink — pak se násobí věkem hráče, koučinkem trenéra a vybavením." },
      { heading: "Koučink trenéra", text: "Vzorec: 0,8 + (koučink/100) × 0,8. Při koučinku 40 = 1,12×, při 80 = 1,44×. Přímo násobí šanci na zlepšení." },
      { heading: "Věk hráče", text: "Pod 20 let: 1,3× bonus. 20–24: 1,15×. 25–29: žádný bonus. 30–33: 0,7×. 34–37: 0,4×. Nad 38: 0,15×. Starší hráči se zlepšují mnohem pomaleji." },
      { heading: "Rozvoj mládeže", text: "Hráči do 22 let mají extra bonus z vlastnosti trenéra: 0,9 + (rozvoj/100) × 0,6. Při rozvoji 60 je to 1,26× navíc." },
      { heading: "Docházka", text: "Závisí na disciplíně HRÁČE (základ: disciplína/100 × 0,6 + 0,3) a na disciplíně TRENÉRA (kolem 40 neutrálně, výš i níž to hýbe docházkou až o desetinu). Alkohol > 70 snižuje o 10 %. Morálka < 30 snižuje o 15 %. Každý km dojezdu snižuje o 0,8 %. Hráč, co nepřijde, ztrácí staminu (5 % šance na −1)." },
      { heading: "Počet tréninků týdně", text: "1× = úterý. 2× = út+čt. 3× = po+st+pá. 4× = po+út+čt+pá. 5× = všechny pracovní dny. Více tréninků = více šancí, ale vyšší náklady a únava hráčů." },
      { heading: "Přístup", text: "Přísný: +10 % docházka, ale hráči s nízkou disciplínou ztrácejí morálku. Volný: −10 % docházka, ale +1 morálka (5 % šance). Vyvážený: bez modifikátorů." },
      { text: "Veteráni (37+) mají šanci na pokles fyzických atributů: (věk−36) × 1 % na rychlost, staminu a sílu.", tip: true },
    ],
  },
  "/dashboard/transfers": {
    title: "Přestupy a nábor",
    icon: "\u{1F91D}",
    sections: [
      { text: "Volní hráči, nabídky a hostování. V okrese je max. 8 volných hráčů, denně přibudou 0–2 noví." },
      { heading: "Odkrytí hráče", text: "Stojí peníze. Ukáže detailní statistiky — bez odkrytí vidíš jen pozici a věk. U cizích hráčů vidíš atributy zaokrouhlené na 5 (rozmazané)." },
      { heading: "Nabídky od Místního kontaktu", text: "20% šance za kolo, že ti někdo doporučí hráče (hospoda, mládež, kamarád). Přijde SMS — hráč se objeví v přestupech." },
      { heading: "Hostování", text: "Půjčka hráče z jiného týmu na 30–90 dní. Hráč se po vypršení automaticky vrátí." },
      { heading: "Kvalita podle velikosti obce", text: "Vesnice: základ 37. Obec: 39. Městys: 41. Město: 44. AI týmy mají kvalitu o 1 stupeň nižší." },
      { text: "Platy hráčů: 10 + (rating/100) × 400 Kč/měsíc. Hráč s ratingem 50 stojí ~210 Kč/měsíc.", tip: true },
    ],
  },
  "/dashboard/finances": {
    title: "Finance klubu",
    icon: "\u{1F4B0}",
    sections: [
      { text: "Rozpočet se mění týdně. Příjmy a výdaje se zpracovávají každé pondělí." },
      { heading: "Příjmy", text: "Dotace obce: vesnice 6 000/měs., obec 10 000, městys 15 000, město 25 000 Kč. Sponzoři: 1 000–8 000/měs. podle typu. Příspěvky hráčů: 100 Kč/hráč/měsíc. Vstupné: 20–50 Kč/divák podle velikosti obce." },
      { heading: "Výdaje", text: "Tréninky: 200–1 000 Kč/trénink (podle velikosti obce). Údržba hřiště: 500–3 000/měsíc. Rozhodčí: 800–1 500 Kč/zápas. Cestovné + občerstvení: 400–1 200 Kč/zápas." },
      { heading: "Zápasové odměny", text: "Výhra: sponzorský bonus + 500 Kč liga + fanouškovský bonus (50–200 Kč). Remíza: 30 % bonusu + 150 Kč. Prohra: nic." },
      { heading: "Místní podpora", text: "Reputace klubu × 100 Kč/měsíc. Při reputaci 50 je to 5 000 Kč/měs., při 70 už 7 000. Detail v sekci Reputace." },
      { text: "Záporný rozpočet = náhodné negativní události (krádež, vandalismus, odchod hráčů). Udržuj kladný zůstatek!", tip: true },
    ],
  },
  "/dashboard/sponsors": {
    title: "Sponzoři",
    icon: "\u{1F3E2}",
    sections: [
      { text: "Sponzoři přinášejí měsíční příjem a bonus za výhru. Počet nabídek závisí na REPUTACI klubu: pod 40 tři nabídky, 40–59 čtyři, 60 a víc pět." },
      { heading: "Typy sponzorů", text: "Hospoda, řeznictví, autoservis, potraviny, obec — každý má jiný rozsah částky i jiný bonus za výhru. Konkrétní čísla vidíš přímo v nabídkách." },
      { heading: "Vliv reputace na částku", text: "Nabídnutá částka se násobí reputací/50 a velikostí obce (vesnice 0,8×, obec 1,0×, městys 1,1×, město 1,3×). Při reputaci 70 dostaneš o 40 % víc než při 50." },
      { heading: "Reputace KLUBU", text: "Rozsah 0–100, start 50. Roste umístěním v lize, postupem v poháru, sezonními akcemi, podpisem hvězdy a vyprodaným stadionem. Klesá přejmenováním klubu, spodní polovinou tabulky a dlouhým obdobím bez úspěchu. Samotná výhra zápasu s ní NEHNE. Detail v sekci Reputace." },
      { heading: "Reputace TRENÉRA", text: "Jiné číslo, rozsah 15–75, start 30. Ta roste výhrami a klesá prohrami. Najdeš ji v profilu trenéra a na stránce Fanoušci." },
    ],
  },
  "/dashboard/reputace": {
    title: "Reputace klubu",
    icon: "⭐",
    sections: [
      { text: "Jak moc se o klubu v okrese ví. Rozsah 0–100, start 50. NEPLEŤ si ji s reputací trenéra — to je jiné číslo (15–75) a to roste za výhry." },
      { heading: "Co odemyká", text: "Vybavení 2. úrovně: 40. Stadion 2. úrovně: 50. Vybavení 3. úrovně: 60. Stadion 3. úrovně: 70. Vždy ještě plus počet odehraných zápasů a číslo sezony." },
      { heading: "Co vydělává", text: "Místní podpora = reputace × 100 Kč/měsíc. Počet i velikost sponzorských nabídek. Bonus k návštěvnosti. Pronájem bufetu. Ochota hráčů k tobě přestoupit." },
      { heading: "Jak ji zvednout", text: "Umístění v lize (první místo +5), pohár (vítěz kumulativně +11), sezonní akce (+1 až +10), podpis hvězdy (+4 až +15), vyprodaný stadion (+1, nejvýš 6× za sezonu), série výher (+2), rodáci v kádru a přízeň obce (+1 měsíčně)." },
      { heading: "Co ji srazí", text: "Spodní polovina tabulky (poslední místo −5), přejmenování klubu (−3), ukončení smlouvy se sponzorem (−2), série proher (−2), prázdné hlediště, málo rodáků, mračící se obec a měsíc bez úspěchu (−1 týdně)." },
      { heading: "Klesající výnosy", text: "Nad 55 se zisky krátí na 75 %, nad 70 na polovinu, nad 85 na čtvrtinu. Ztráty se nekrátí. Čím výš jsi, tím dražší je stoupat." },
      { text: "Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec — tam reputace nerozhoduje, jen přízeň obce.", tip: true },
    ],
  },
  "/dashboard/fans": {
    title: "Fanoušci a občerstvení",
    icon: "\u{1F4E3}",
    sections: [
      { text: "Čtyři záložky: Základna (kolik máš fanoušků), Spokojenost (jak jsou naloženi), Občerstvení (bufet) a Prodeje." },
      { heading: "Spokojenost (0–100)", text: "Mění se po každém zápase. Výhra +6, prohra −5, drahé vstupné −2, levné +1, kvalitní občerstvení +1 za produkt, došlé zásoby −2, čistá sociálka až +3, trenér −3 až +3. Celkem nejvýš ±15 za zápas." },
      { heading: "Loajalita", text: "Dlouhodobá hladina, ke které se spokojenost každý den o bod vrací. Sama míří k reputaci klubu, posunuté o vliv trenéra (−2 až +2). Přes 100 nejde." },
      { heading: "Vliv trenéra", text: "Vliv = 0,6 × reputace + 0,4 × motivace, neutrál je 44. Pásma po pěti bodech: 47–51 dává +1, 52–56 dává +2, 57 a víc +3. Pásmo 42–46 je nula. Níže se jde do minusu: 37–41 je −1, 32–36 je −2, 31 a míň −3." },
      { heading: "Jak zvednout reputaci trenéra", text: "Výhra +1 (o tři a víc gólů +2), prohra −1 (debakl −2) — projeví se asi v třetině zápasů. Konec sezony: první místo ve 14 týmech +10, poslední −10. Pohár: osmifinále +2, čtvrtfinále +3, semifinále +5, výhra ve finále +8. Proslov na závěrečné párty +1 nebo −1 podle tónu. Rozsah 15–75." },
      { heading: "Motivace trenéra", text: "Konec sezony v horní polovině +1, ve spodní poloviční šance na −1. Zhruba každá osmá prohra (debakl každá čtvrtá) sebere bod motivace nebo disciplíny. Sama od sebe neroste." },
      { text: "Spokojenost násobí návštěvnost (0,75× až 1,25×), cenu vstupenky (0,7× až 1,3×) i tržby v bufetu. Vyplatí se ji hlídat.", tip: true },
    ],
  },
  "/dashboard/equipment": {
    title: "Vybavení",
    icon: "\u{1F3BD}",
    sections: [
      { text: "Správa vybavení klubu. Amortizace vybavení stojí ~500 Kč/měsíc." },
      { heading: "Zámky vylepšení", text: "2. úroveň: reputace 40+ a 5 odehraných zápasů. 3. úroveň: reputace 60+, 15 zápasů a sezona 2+." },
    ],
  },
  "/dashboard/stadium": {
    title: "Stadion a hřiště",
    icon: "\u{1F3DF}️",
    sections: [
      { text: "Stav hřiště ovlivňuje kvalitu hry a riziko zranění." },
      { heading: "Počasí", text: "Déšť: technika 0,8×, zranění 1,3×. Sníh: technika 0,7×, zranění 1,4×. Vítr: technika 0,9×. Počasí se generuje náhodně." },
      { heading: "Návštěvnost", text: "Závisí na fanouškovské základně, reputaci klubu, formě, počasí a kapacitě. Základní vstupné: vesnice 20, obec 30, městys 40, město 50 Kč/divák." },
      { heading: "Zámky vylepšení", text: "2. úroveň: reputace 50+ a 15 odehraných zápasů. 3. úroveň: reputace 70+, 35 zápasů a sezona 3+. Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec — tam reputace nerozhoduje, jen přízeň." },
    ],
  },
  "/dashboard/events": {
    title: "Události",
    icon: "\u{1F4C5}",
    sections: [
      { text: "Náhodné události mezi zápasy. Mohou být pozitivní i negativní." },
      { heading: "Pozitivní", text: "Sponzorský dar, dotace od obce, bonus za dobré výsledky. Zvyšují rozpočet nebo reputaci." },
      { heading: "Negativní", text: "Krádež, poškození vybavení, pokuta, vandalismus. Čím nižší rozpočet, tím vyšší riziko." },
    ],
  },
  "/dashboard/liga": {
    title: "Ligová tabulka",
    icon: "\u{1F3C6}",
    sections: [
      { text: "Tabulka všech týmů v tvé lize. Klikni na název pro detail týmu." },
      { heading: "Body", text: "V = 3, R = 1, P = 0. Při rovnosti bodů rozhoduje skóre." },
      { heading: "AI týmy", text: "Počítačem řízené týmy mají kvalitu o 1 kategorii nižší než lidští hráči. Vesnické AI = základ 35 místo 37." },
    ],
  },
  "/dashboard/calendar": {
    title: "Kalendář sezony",
    icon: "\u{1F4C6}",
    sections: [
      { text: "Měsíční přehled. Zobrazuje tréninkové dny, zápasy a volné dny." },
      { heading: "Sezona", text: "Délka sezony je 112 herních dnů. Zápasy se hrají typicky o víkendech podle rozpisu ligy." },
      { text: "Ve volné dny se hráčům regeneruje kondice podle staminy.", tip: true },
    ],
  },
  "/dashboard/match": {
    title: "Detail zápasu",
    icon: "⚽",
    sections: [
      { text: "Výsledek, statistiky, sestavy a možnost přehrání." },
      { heading: "Jak funguje zápas", text: "Každá minuta má ~10% šanci na útočnou akci. Šance na gól = základ + (útok−obrana)/100. Rozsah 6–28 %. Taktika modifikuje: útočná 1,3× útok, ale 0,8× obrana." },
      { heading: "Karty", text: "Šance na kartu závisí na temperamentu a disciplíně hráče. Každé 4 žluté = 1 zápas stop. Červená = okamžitý 1 zápas stop." },
      { heading: "Zranění", text: "~1 % za minutu. Déšť 1,3×, sníh 1,4×. Horší stav hřiště zvyšuje riziko. Zraněný hráč chybí 1–12 kol." },
      { text: "Hráč s kondicí pod 60 % hraje až na 60 % svého potenciálu. Kondice klesne během zápasu — výrazněji u hráčů s nízkou staminou.", tip: true },
    ],
  },
  "/dashboard/news": {
    title: "Zpravodaj",
    icon: "\u{1F4F0}",
    sections: [
      { text: "Ligové zprávy — výsledky kol, přestupy, události. Generují se automaticky po každém odehraném kole." },
    ],
  },
  "/dashboard/settings": {
    title: "Nastavení",
    icon: "⚙️",
    sections: [
      { text: "Změna hesla. Minimálně 8 znaků, velké písmeno, malé písmeno, číslo." },
    ],
  },
  "/dashboard/invite": {
    title: "Pozvi kamaráda",
    icon: "✉️",
    sections: [
      { text: "Vygeneruj odkaz a pošli ho kamarádovi. Uvidí tvůj tým, obec a pozici v lize. Po registraci se přidá do stejného okresu." },
      { heading: "Jak to funguje", text: "Kamarád klikne na odkaz, uvidí tvoji výzvu a může si rovnou založit účet. Automaticky se přidá do tvé ligy." },
      { text: "Na mobilu použij tlačítko Sdílet pro odeslání přes WhatsApp, Messenger nebo jinou aplikaci.", tip: true },
    ],
  },
};

function findHelp(pathname: string): HelpEntry | null {
  if (HELP[pathname]) return HELP[pathname];
  if (pathname.startsWith("/onboarding")) return null;
  if (pathname.startsWith("/dashboard/player/")) return {
    title: "Profil hráče",
    icon: "\u{1F464}",
    sections: [
      { text: "Detailní statistiky, osobnost, životní kontext a historie zápasů." },
      { heading: "Dovednosti", text: "7 atributů: rychlost, technika, střelba, přihrávky, hlavičky, obrana, brankář. Zlepšují se tréninkem — základ je 10 % za trénink, násobený věkem, koučinkem a vybavením. Nad 50 bodů se zlepšování výrazně zpomaluje." },
      { heading: "Osobnost", text: "Disciplína = docházka na tréninky. Patriotismus = loajalita ke klubu. Temperament = riziko karet. Alkohol > 70 = −10 % docházka a vyšší únava v zápase (+0,15 kondice/min)." },
      { heading: "Životní kontext", text: "Zaměstnání a rodina ovlivňují dostupnost. Řidič kamionu nebo otec malých dětí může častěji chybět. Dojezdová vzdálenost snižuje docházku o 0,8 %/km." },
      { text: "Šipky v hlavičce posouvají mezi hráči TOHO TÝMU, kterému hráč patří.", tip: true },
    ],
  };
  if (pathname.startsWith("/dashboard/team/")) return {
    title: "Profil týmu",
    icon: "\u{1F3DF}️",
    sections: [
      { text: "Detail týmu — kádr, výsledky, statistiky. Klikni na hráče pro jeho profil." },
      { heading: "Cizí hráči", text: "U hráčů cizích týmů vidíš atributy zaokrouhlené na 5 (rozmazané). Pro přesné hodnoty musíš hráče odkrýt v přestupech." },
    ],
  };
  if (pathname.match(/\/dashboard\/match\/[^/]+$/)) return HELP["/dashboard/match"];
  if (pathname.includes("/replay")) return {
    title: "Přehrání zápasu",
    icon: "▶️",
    sections: [
      { text: "Textový komentář minuta po minutě. Góly, šance, fauly, karty, střídání." },
      { heading: "Průběh", text: "Každá minuta se simuluje zvlášť. Útočné akce, držení míče, speciální události. O poločase se hráčům obnoví +5 kondice." },
      { text: "Góly v posledních 15 minutách jsou ovlivněny clutch atributem hráče (0,9–1,1× modifikátor).", tip: true },
    ],
  };
  // Skrýt nápovědu v detailu konverzace — překrývá input na mobilu
  if (pathname.match(/\/dashboard\/phone\/.+/)) return null;
  return null;
}

// ── Shared UI components ───────────────────────────────────

function HelpPanel({ help, onClose }: { help: HelpEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed bottom-[5.5rem] sm:bottom-20 left-3 right-3 sm:left-auto sm:right-4 z-[var(--z-nav)] sm:w-[360px] max-h-[55vh] sm:max-h-[70vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-100 animate-slide-up">
        <div className="sticky top-0 bg-pitch-700 text-white px-5 py-3 rounded-t-xl flex items-center gap-3">
          <span className="text-xl">{help.icon}</span>
          <span className="font-heading font-bold text-base">{help.title}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {help.sections.map((s, i) => (
            <div key={i} className={s.tip ? "bg-pitch-50 border border-pitch-200 rounded-soft px-3 py-2" : ""}>
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
          Klepni kamkoli mimo a nápověda se zavře
        </div>
      </div>
    </>
  );
}

function HelpButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`fixed z-[var(--z-nav)] w-11 h-11 rounded-full bg-pitch-700 text-white shadow-lg hover:bg-pitch-600 transition-all flex items-center justify-center font-heading font-bold text-lg ${className ?? "bottom-24 sm:bottom-6 right-4"}`}
      title={open ? "Zavřít nápovědu" : "Nápověda"}
      aria-label={open ? "Zavřít nápovědu" : "Nápověda"}
    >
      {open ? "✕" : "?"}
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
      title: "Výběr obce",
      icon: "\u{1F4CD}",
      sections: [
        { text: "Vyber si obec, kde založíš svůj klub. Velikost obce určuje startovní podmínky." },
        { heading: "Vesnice (do 500 ob.)", text: "Základ hráčů: 37. Rozpočet: nejmenší. Tréninky: 200 Kč. Dotace: 6 000/měs. Ale nejslabší soupeři!" },
        { heading: "Obec (500–2 000)", text: "Základ: 39. Tréninky: 400 Kč. Dotace: 10 000/měs. Vyvážený start." },
        { heading: "Městys (2 000–5 000)", text: "Základ: 41. Tréninky: 600 Kč. Dotace: 15 000/měs. Silnější liga." },
        { heading: "Město (5 000+)", text: "Základ: 44. Tréninky: 1 000 Kč. Dotace: 25 000/měs. Nejsilnější soupeři." },
        { text: "Všechny týmy ve tvé lize budou ze stejného okresu. AI týmy mají kvalitu o 1 stupeň nižší než ty.", tip: true },
      ],
    },
    manager: {
      title: "Profil trenéra",
      icon: "\u{1F9D1}‍\u{1F4BC}",
      sections: [
        { text: "Trenéra pojmenuj a vyber mu příběh. Příběh určuje startovní bonusy." },
        { heading: "Koučink", text: "Násobí šanci na zlepšení hráčů při tréninku: 0,8 + koučink/100 × 0,8. Při koučinku 40 je to 1,12×, při 80 už 1,44×." },
        { heading: "Motivace", text: "Ovlivňuje morálku týmu a výkon v zápase." },
        { heading: "Taktika", text: "Přidává bonus k dovednostem v zápase (+1–5 podle úrovně)." },
        { heading: "Disciplína", text: "Ovlivňuje reakce hráčů na přísný trénink." },
        { text: "Vlastnosti trenéra rostou s každým odehraným zápasem (10% šance na +1 k náhodnému atributu).", tip: true },
      ],
    },
    club: {
      title: "Název klubu",
      icon: "\u{1F3DF}️",
      sections: [
        { text: "Zvol název klubu a stadionu. Klasické české názvy: SK, FK, TJ, Sokol, Spartak…" },
        { heading: "Sponzor", text: "Dostaneš nabídku od místního sponzora. Příjem 1 000–8 000 Kč/měsíc + bonus za výhru. Lepší nabídky přijdou s vyšší reputací." },
      ],
    },
    team: {
      title: "Barvy a dres",
      icon: "\u{1F3BD}",
      sections: [
        { text: "Vyber primární a sekundární barvu dresu a vzor." },
        { text: "Barvy se zobrazí v zápasech, v tabulce a na profilu týmu. Vzor dresu je jen vizuální.", tip: true },
      ],
    },
    reveal: {
      title: "Tvůj tým",
      icon: "\u{1F31F}",
      sections: [
        { text: "Vygenerovaný kádr. Každý hráč má unikátní osobnost, zaměstnání a schopnosti." },
        { heading: "Rating", text: "Vesnice: kolem 35–40. Město: 40–45. Wonderkid (2% šance, věk ≤21): +15–25 navíc!" },
        { heading: "Osobnost", text: "Disciplína určuje docházku. Patriotismus loajalitu. Alkohol únavu a absenci. Temperament riziko karet." },
        { text: "Po dokončení začni posouvat dny. Tréninky jsou út+čt (2×/týden). První zápas bude o víkendu.", tip: true },
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
