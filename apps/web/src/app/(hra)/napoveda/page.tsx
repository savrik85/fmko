"use client";

import Link from "next/link";
import { DataTable, EntityCell } from "@/components/ui";
import { ManagerFansBandsTable } from "@/components/fans/manager-fans-bands";
import { MANAGER_FANS } from "@okresni-masina/shared";
import { ATTRIBUTE_INFO, type AttrKey, type Pos } from "@/lib/attribute-info";
import { TACTIC_INFO, FORMATION_INFO, HARDNESS_INFO, type TacticKey, type HardnessKey } from "@/lib/tactic-info";

const POS_LABEL: Record<Pos, string> = {
  GK: "Brankář",
  DEF: "Obrana",
  MID: "Záloha",
  FWD: "Útok",
};

const POS_COLOR: Record<Pos, string> = {
  GK: "bg-gold-500",
  DEF: "bg-blue-500",
  MID: "bg-pitch-500",
  FWD: "bg-card-red",
};

// Skill atributy seřazené podle významu pro zápas
const SKILL_KEYS: AttrKey[] = ["spd", "tec", "sho", "pas", "hea", "def", "vis", "cre", "exp", "set", "gk", "sta", "str"];

export default function NapovedaPage() {
  return (
    <div className="page-container space-y-4">
      <div className="card p-4">
        <h1 className="font-heading font-[800] text-2xl mb-1">📖 Nápověda: jak hra funguje</h1>
        <p className="text-sm text-muted">
          Vše, co rozhoduje o výsledku zápasu. Atributy hráčů, taktiky, formace, kondice a další faktory.
        </p>
      </div>

      {/* ═══ ATRIBUTY × POZICE MATRIX ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          ⚽ <span>Atributy a pozice</span>
        </h2>
        <p className="text-sm text-muted">
          Každá pozice se hodnotí podle jiných atributů. Zatržítko = klíčový atribut pro pozici.
        </p>
        <div className="-mx-4 border-y border-line">
          <DataTable rows={SKILL_KEYS} rowKey={(key) => key}
            empty="Atributy nejsou k dispozici."
            columns={[
              { key: "attr", header: "Atribut", align: "left",
                cell: (key) => <EntityCell name={ATTRIBUTE_INFO[key].label} meta={ATTRIBUTE_INFO[key].description} metaMobileOnly /> },
              ...(["GK", "DEF", "MID", "FWD"] as Pos[]).map((pos) => ({
                key: pos, width: "w-14",
                header: <span className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${POS_COLOR[pos]}`} />{POS_LABEL[pos].slice(0, 3)}</span>,
                title: POS_LABEL[pos],
                cell: (key: AttrKey) => ATTRIBUTE_INFO[key].relevantFor.includes(pos)
                  ? <span className="text-pitch-600 font-bold">✓</span>
                  : <span className="text-muted-light">-</span>,
              })),
              { key: "meaning", header: "Význam", align: "left", priority: 2, cell: (key) => <span className="text-meta">{ATTRIBUTE_INFO[key].description}</span> },
            ]} />
        </div>
      </section>

      {/* ═══ TAKTIKY ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          🎯 <span>Taktiky</span>
        </h2>
        <p className="text-sm text-muted">
          Taktika mění sílu útoku a obrany a počet šancí, které tým vytvoří. Plně zabere, jen když na ni máš hráče a sedí k formaci.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(TACTIC_INFO) as TacticKey[]).map((key) => {
            const t = TACTIC_INFO[key];
            return (
              <div key={key} className="border border-gray-200 rounded-soft p-3">
                <div className="font-heading font-bold text-sm mb-1">{t.label}</div>
                <p className="text-xs text-muted leading-relaxed">{t.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ TVRDOST HRY ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          💪 <span>Tvrdost hry</span>
        </h2>
        <p className="text-sm text-muted">
          Třetí osa vedle formace a taktiky. Vyplatí se ji volit podle toho, kdo bude zápas
          pískat. Rozhodčí se deleguje dva herní dny předem, takže to stihneš.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(HARDNESS_INFO) as HardnessKey[]).map((key) => {
            const h = HARDNESS_INFO[key];
            return (
              <div key={key} className="border border-gray-200 rounded-soft p-3">
                <div className="font-heading font-bold text-sm mb-1">{h.icon} {h.label}</div>
                <p className="text-xs text-muted leading-relaxed">{h.description}</p>
              </div>
            );
          })}
        </div>
        <div className="text-sm space-y-1.5 border-t border-gray-100 pt-3">
          <p><span className="font-heading font-bold">Zisk z tvrdé hry není pevný.</span> Škálují ho tři věci:
            jestli na ni máš kádr (agresivita, síla, pracovitost), jak přísný je sudí, a kolik hráčů už má
            žlutou. Riziko se naproti tomu neškáluje: fauly a karty přijdou v plné výši, i když tvrdou
            hru neumíš. Technický kádr si tím tedy spíš uškodí.</p>
          <p><span className="font-heading font-bold">Červená karta oslabuje.</span> Vyloučený chybí
            přesně tam, kde hrál: bez stopera je slabší obrana, bez útočníka útok. Zbytek týmu navíc musí
            pokrýt jeho prostor, a víc to bolí dopředu než dozadu.</p>
          <p><span className="font-heading font-bold">Tvrdá hra zraňuje.</span> Víc soupeře než vlastní
            hráče, ale obě strany na to doplácejí.</p>
        </div>
      </section>

      {/* ═══ FORMACE ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          📋 <span>Formace</span>
        </h2>
        <p className="text-sm text-muted">
          Formace určuje, kolik hráčů máš v každé řadě. Síla řady je součet jejích hráčů, takže víc obránců znamená silnější obranu a víc záložníků víc míče. Formace ladí i s taktikou. Sehranost roste každým zápasem ve stejné formaci a taktickým tréninkem, ostatní formace mezitím pomalu zapomínáte.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(FORMATION_INFO).map(([key, f]) => {
            const styleBg = f.style === "offensive" ? "bg-red-50 border-red-200"
              : f.style === "defensive" ? "bg-blue-50 border-blue-200"
              : "bg-gray-50 border-gray-200";
            return (
              <div key={key} className={`border rounded-soft p-3 ${styleBg}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-heading font-bold text-base tabular-nums">{f.label}</span>
                  <span className="text-micro uppercase tracking-wide text-muted">
                    {f.style === "offensive" ? "Útočná" : f.style === "defensive" ? "Defenzivní" : "Vyrovnaná"}
                  </span>
                </div>
                <p className="text-xs text-ink leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ KONDICE & MORÁLKA ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          💪 <span>Kondice a morálka</span>
        </h2>
        <div className="space-y-2 text-sm">
          <div>
            <div className="font-heading font-bold text-sm">Kondice (0–100 %)</div>
            <p className="text-muted text-xs leading-relaxed">
              Unavený hráč hraje slabší: s plnou kondicí naplno, úplně vyčerpaný zhruba na 85 % své síly.
              Víc ale bolí únava celé sestavy: tým si vytvoří jen tolik procent šancí, kolik má průměrnou kondici, nejméně 45 %.
              Kondice klesá po zápase a tréninku a denně se vrací podle staminy: +20 % (stamina 75 a víc),
              +16 % (50+), +13 % (25+), +10 % (pod 25). Hráči do 21 let mají +3 % navíc, nad 35 let −3 %.
              Mezi koly se kondice většinou vrátí skoro celá, šetřit má smysl hlavně po zranění nebo při zápasech den po dni.
            </p>
          </div>
          <div>
            <div className="font-heading font-bold text-sm">Morálka (0–100)</div>
            <p className="text-muted text-xs leading-relaxed">
              Ovlivňuje výkon v zápase: sebevědomý tým si vytváří víc šancí a líp zakončuje. Každý vstřelený
              gól zvedne morálku týmu o +2 až +4 (dle vůdcovství), inkasovaný ji sebere o −1 až −3. Denně se
              táhne k 50 (nad 55 klesá, pod 45 roste). Příliš nízká morálka + nízký patriotismus = riziko odchodu hráče.
            </p>
          </div>
          <div>
            <div className="font-heading font-bold text-sm">Hra mimo pozici</div>
            <p className="text-muted text-xs leading-relaxed">
              Hráč mimo svou přirozenou pozici ztrácí 10–40 % klíčových atributů podle toho, jak daleko od své
              role hraje (nejhorší je pole ↔ branka, −40 % ze všeho). Drž hráče na jejich pozici, pokud nemusíš.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ MANAŽER ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          🧑‍💼 <span>Trenér a jeho vlastnosti</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Koučink</div>
            <p className="text-sm text-muted">Násobí šanci hráčů na zlepšení při tréninku: při hodnotě 40 je to 1,12×, při 80 už 1,44×.</p>
          </div>
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Motivace</div>
            <p className="text-sm text-muted">Před zápasem zvedne morálku celé sestavě i lavičce: při 40 o bod, při 60 o tři, při 80 o pět. Hráči, kteří nejedou na zápas, to u motivátora nesou líp a méně trucují. Spolu s reputací a formou určuje, jak trenéra berou fanoušci.</p>
          </div>
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Taktika</div>
            <p className="text-sm text-muted">Přidává nebo ubírá celé sestavě přihrávky a obranu: při 10 je to −2, při 40 nula, při 60 +1, při 99 +4. Tým se pod dobrým taktikem rychleji sehraje na formaci (při 60 o pětinu rychleji).</p>
          </div>
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Disciplína</div>
            <p className="text-sm text-muted">Hýbe docházkou na trénink (kolem 40 neutrální), ubírá fauly a žluté karty (při 99 o pětinu méně karet) a krotí průšvihy v hospodě. Lajdák pod 40 to má obráceně. Přísnost tréninku se nastavuje zvlášť na stránce Tréninky.</p>
          </div>
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Práce s mládeží</div>
            <p className="text-sm text-muted">Bonus k tréninku pro hráče do 22 let (při 60 je to 1,26×) a k jejich růstu z odehraných minut (při 60 o desetinu víc, pod 40 méně).</p>
          </div>
          <div className="border border-gray-200 rounded-soft p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Reputace</div>
            <p className="text-sm text-muted">Co má trenér za sebou (15–75). Roste výhrami a umístěním na konci sezóny, klesá prohrami. Láká hráče: volní hráči podepisují ochotněji a hráči jiných klubů chtějí přestoupit k trenérovi s větším jménem. Spolu s motivací a formou určuje, jak ho berou fanoušci.</p>
          </div>
        </div>

        {/* Vliv trenéra na fanoušky */}
        <div className="pt-3 border-t border-gray-100">
          <h3 className="font-heading font-bold text-base mb-1">Vliv trenéra na fanoušky</h3>
          <p className="text-sm text-muted mb-3">
            Z reputace, motivace a formy týmu se počítá jedno číslo, <strong className="text-ink">vliv</strong>:{" "}
            <span className="tabular-nums">
              {String(MANAGER_FANS.REP_WEIGHT).replace(".", ",")} × reputace + {String(MANAGER_FANS.MOT_WEIGHT).replace(".", ",")} × motivace + {String(MANAGER_FANS.FORM_WEIGHT).replace(".", ",")} × forma
            </span>. Neutrál je {MANAGER_FANS.NEUTRAL}.
          </p>
          <div className="-mx-4 border-y border-line">
            <ManagerFansBandsTable />
          </div>
          <div className="text-sm text-muted mt-3 space-y-1">
            <p>
              <strong className="text-ink">Po zápase</strong> se hodnota přičte ke spokojenosti fanoušků,
              pro srovnání: výhra je +6, prohra −5. <strong className="text-ink">Loajalita</strong> je
              hladina, ke které se spokojenost každý den o bod vrací.
            </p>
            <p>
              <strong className="text-ink">Jak reputaci hýbat:</strong> výhra +1 (o tři a víc gólů +2),
              prohra −1 (debakl −2), projeví se asi v třetině zápasů. Konec sezóny: ve čtrnáctičlenné
              lize první místo +10, poslední −10. Pohár: osmifinále +2, čtvrtfinále +3, semifinále +5,
              výhra ve finále +8. Proslov na závěrečné párty přidá nebo ubere bod podle tónu.
            </p>
            <p>
              <strong className="text-ink">Motivace</strong> roste jen umístěním v horní polovině tabulky
              na konci sezóny (+1). Ve spodní polovině je poloviční šance na −1, a zhruba každá osmá
              prohra sebere bod motivace nebo disciplíny.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ DVĚ REPUTACE ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          ⭐ <span>Dvě reputace, nepleť si je</span>
        </h2>

        <div className="border border-gray-200 rounded-soft p-3">
          <div className="font-heading font-bold text-base mb-1">Reputace klubu (0–100, start 50)</div>
          <p className="text-sm text-muted leading-relaxed mb-2">
            Jak moc se o klubu v okrese ví. Ovlivňuje návštěvnost, podporu místních podnikatelů
            (reputace × 100 Kč měsíčně), počet i velikost sponzorských nabídek, výnos bufetu,
            ochotu hráčů k tobě přestoupit a <strong className="text-ink">odemyká vyšší úrovně
            stadionu a vybavení</strong>.
          </p>
          <p className="text-sm text-muted leading-relaxed mb-2">
            <strong className="text-ink">Roste:</strong> umístěním v lize (první místo +5), postupem
            v poháru (vítěz kumulativně +11), sezónními akcemi, podpisem hvězdy (+4 až +15),
            vyprodaným stadionem, sérií výher, rodáky v kádru a vysokou přízní obce.
          </p>
          <p className="text-sm text-muted leading-relaxed mb-2">
            <strong className="text-ink">Klesá:</strong> spodní polovinou tabulky (poslední −5),
            přejmenováním klubu (−3), ukončením smlouvy se sponzorem (−2), sérií proher, prázdným
            hledištěm a měsícem bez úspěchu (−1 týdně).
          </p>
          <p className="text-sm text-muted leading-relaxed">
            <strong className="text-ink">Samotná výhra zápasu ji nezvedne.</strong> Nad 55 bodů se
            zisky krátí: čím jsi výš, tím dráž se stoupá. Kompletní rozpis i historii najdeš
            v sekci <Link href="/reputace" className="text-pitch-600 underline">Reputace</Link>.
          </p>
        </div>

        <div className="border border-gray-200 rounded-soft p-3">
          <div className="font-heading font-bold text-base mb-1">Reputace trenéra (15–75, start 30)</div>
          <p className="text-sm text-muted leading-relaxed">
            Tvoje osobní jméno v okrese, ne jméno klubu. <strong className="text-ink">Ta</strong> roste
            výhrami (+1, výhra o tři a víc gólů +2) a klesá prohrami. Spolu s motivací určuje, jak
            trenéra berou fanoušci (viz tabulka výš).
          </p>
        </div>
      </section>
      {/* ═══ STADION ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          🏟️ <span>Stadion a hřiště</span>
        </h2>
        <div className="space-y-2 text-sm">
          <p className="text-muted text-xs leading-relaxed">
            Stav hřiště ovlivňuje kvalitu hry a riziko zranění. Vybavení (míče, kopačky, vesty) zlepšuje techniku
            a kondici hráčů.
          </p>
          <div>
            <div className="font-heading font-bold text-sm">Počasí</div>
            <p className="text-muted text-xs">
              Déšť: technika 0,8×, zranění 1,45×. Sníh: technika 0,7×, zranění 1,6×. Vítr: technika 0,9×,
              dlouhé míče trpí. Při dešti a sněhu zvaž taktiku Nakopávané, ve větru ne.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ MLÁDEŽ A AKADEMIE ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          ⚽ <span>Mládež a akademie</span>
        </h2>
        <div className="space-y-2 text-sm text-muted leading-relaxed">
          <p><strong className="text-ink">Akademie</strong> je družstvo žáků (11 až 14 let) z tvé obce. Kolik žáků obec dá, záleží na počtu obyvatel. Od 9 žáků hraje družstvo okresní soutěž žáků (zápasy se ve hře neukazují): žáci díky ní rostou naplno a méně jich skončí. S menším počtem jen trénují, rostou poloviční rychlostí a víc jich odejde.</p>
          <p><strong className="text-ink">Trenér</strong> je nutný a každý něco stojí. Placený trenér mládeže: dobrý žáky posune nejvíc a nejpřesněji odhadne talent, ale dorost (U21) a mladí v áčku pak dostanou jen polovinu jeho bonusu. Hráč áčka od 28 let: zadarmo, méně žáků skončí a přijde víc dětí, ale sám chodí méně na trénink áčka. Táta jednoho ze žáků: zadarmo, průměrná příprava, na nábor přivede žáka navíc, a až jeho syn skončí, skončí i on.</p>
          <p><strong className="text-ink">Kolik do akademie dáváš:</strong> skromná (200 Kč + 30 Kč za žáka týdně), běžná (300 Kč + 50 Kč), ambiciózní (500 Kč + 90 Kč, se soustředěním a turnaji). Víc peněz znamená rychlejší růst a méně odchodů. Růst se mění hned od příštího týdne, odchody a noví žáci v létě podle toho, kolik týdnů sezóny která úroveň trvala. Klubové vybavení (míče, pomůcky, zimní výbava, dodávka) pomáhá zvlášť a kupuje se ve Vybavení.</p>
          <p><strong className="text-ink">Do dorostu:</strong> každé léto jdou čtrnáctiletí do U21. Nadějného žáka od 13 let můžeš dát do dorostu dřív. Podle FAČR smí žák do dorostu od 13 let a za muže (áčko) až od 15. Bez U21 nabídne trenér čtrnáctileté nejbližšímu klubu s dorostem: když je vezme, dostaneš tabulkové odstupné, když ne, žák skončí.</p>
          <p><strong className="text-ink">Noví žáci:</strong> každé léto ročník jedenáctiletých z obce, k tomu žáci z okolních obcí bez akademie, náborový den ve škole (levnější, víc dětí 11–12 let z obce), den otevřených dveří na hřišti (dražší, méně dětí, ale i z okolních obcí, 11–14 let, s větším zápalem a přesnějším odhadem talentu), obojí jednou za sezónu (nábor ve škole jde pod 9 žáky opakovat jednou za týden), a přetahování nadějných žáků z klubů do 15 km. Přestupy žáků jsou v létě za tabulkové odstupné FAČR.</p>
        </div>
      </section>

      {/* ═══ DALŠÍ ZDROJE ═══ */}
      <section className="card p-4">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2 mb-2">
          🔗 <span>Další zdroje</span>
        </h2>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/kadr" className="text-pitch-600 underline">Kádr →</Link>
            <span className="text-muted text-xs ml-2">vidíš tam atributy svých hráčů (najetí myší = nápověda)</span>
          </li>
          <li>
            <Link href="/akademie" className="text-pitch-600 underline">Akademie →</Link>
            <span className="text-muted text-xs ml-2">tvoji žáci, trenér, nábor a kolik do akademie dáváš</span>
          </li>
          <li>
            <Link href="/zapas" className="text-pitch-600 underline">Sestava →</Link>
            <span className="text-muted text-xs ml-2">před zápasem vidíš sílu sestavy a porovnání se soupeřem</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
