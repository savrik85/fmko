"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import styles from "./landing.module.css";

const features = [
  ["01", "Kabina plná příběhů", "Tvůj útočník má ranní směnu. Brankář včera zavíral hospodu. Každý hráč má práci, povahu a život, který se na hřišti nezapře."],
  ["02", "Fotbal, který řídíš ty", "Sestava, taktika, trénink i přestupy. Vychovávej dorost, hledej posily a sleduj zápasy s komentářem, který patří na okres."],
  ["03", "Klub od dresu po tribunu", "Dej klubu jméno, barvy a vlastní identitu. Rozvíjej stadion, hlídej rozpočet a vyjednávej s místními sponzory."],
  ["04", "Žije to i za lajnou", "Fanoušci, obec, rozhodčí, místní noviny i hospoda. Výsledky jsou jen část příběhu. Na okrese se řeší všechno."],
  ["05", "Liga ve vašich rukou", "Jako zakladatel dostaneš první předsednický mandát. S ostatními manažery rozhodujete o soutěži, jejím rozpočtu a dalším rozvoji."],
  ["06", "Za hranice okresu", "Domácím derby to nekončí. V pohárech se vaše kluby potkají se soupeři z jiných lig. Ukažte, kde se hraje nejlepší fotbal."],
];

export function LandingPage({ redirectPlayers = true }: { redirectPlayers?: boolean }) {
  const { teamId, isLoading } = useTeam();
  const router = useRouter();
  useEffect(() => { if (redirectPlayers && !isLoading && teamId) router.replace("/prehled"); }, [redirectPlayers, teamId, isLoading, router]);

  return <main className={styles.site}>
    <header className={styles.nav}>
      <Link href="/" className={styles.logo} aria-label="Prales — úvod">PRA<span>L</span>ES<span className={styles.logoDot}>.</span></Link>
      <nav aria-label="Hlavní navigace"><a href="#hra">O hře</a><a href="#jak-to-funguje">Jak začít</a><Link href="/prihlaseni">Přihlásit se <span aria-hidden="true">↗</span></Link></nav>
    </header>

    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> FOTBALOVÝ MANAŽER Z ČESKÉHO OKRESU</p>
        <h1 id="hero-title">VELKEJ FOTBAL.<br />MALEJ OKRES.<br /><em>VAŠE LIGA.</em></h1>
        <p className={styles.lead}>Dej dohromady partu. Založ ligu u vás doma.<br className={styles.desktopBreak} /> A konečně si vyřiďte, kdo z vás fotbalu rozumí nejvíc.</p>
        <div className={styles.actions}><Link href="/registrace" className={styles.primary}>Založit vlastní ligu <span aria-hidden="true">↗</span></Link><a href="#hra" className={styles.textLink}>Nahlédnout do Pralesa ↓</a></div>
        <p className={styles.micro}>Jen jméno, e-mail a okres. Váš Prales připravíme do 24 hodin.</p>
      </div>
      <div className={styles.heroArt}>
        <img src="/images/prales-okres.webp" alt="Vesnické fotbalové hřiště, klubovna a česká krajina v podvečerním slunci" width="1536" height="1024" fetchPriority="high" />
        <div className={styles.artCaption}><span>DOMÁCÍ HŘIŠTĚ. VLASTNÍ PRAVIDLA HRY.</span><strong>Tady začínají velký příběhy.</strong></div>
        <div className={styles.stamp}>100 %<span>OKRES</span></div>
      </div>
    </section>

    <div className={styles.strip}><span>TVŮJ OKRES</span><b aria-hidden="true">✳</b><span>TVOJE PARTA</span><b aria-hidden="true">✳</b><span>VAŠE RIVALITA</span><b aria-hidden="true">✳</b><span>JEDEN PRALES</span></div>

    <section id="hra" className={styles.story}>
      <div><p className={styles.eyebrow}>VÍTEJ TAM, KDE FOTBAL JEŠTĚ VONÍ TRÁVOU</p><h2>Na lavičce trenér.<br />U zábradlí půlka vsi.<br /><em>A teď je to na tobě.</em></h2></div>
      <div className={styles.storyText}><p>Zapomeň na milionové přestupy. Tady se shání jedenáct lidí na neděli, sponzor má autodílnu za rohem a o posledním derby se mluví ještě ve středu.</p><p>Prales je fotbalový manažer zasazený do skutečných českých obcí. Buduješ klub, poznáváš svoje hráče a píšeš příběh, který v tabulce nenajdeš.</p><strong>Nejlepší je, když soupeře znáš osobně.</strong></div>
    </section>

    <section className={styles.features} aria-labelledby="features-title"><div className={styles.sectionTop}><p className={styles.eyebrow}>CELÝ OKRES. V JEDNÉ HŘE.</p><h2 id="features-title">Devadesát minut je jen začátek.</h2></div><div className={styles.featureGrid}>{features.map(([number, title, copy]) => <article key={number}><span className={styles.number}>{number} /</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className={styles.friends}><div><p className={styles.eyebrow}>PARTA KAMARÁDŮ JE NEJLEPŠÍ ZAČÁTEK</p><h2>Ve skupině jste experti.<br /><em>Tak to ukažte v lize.</em></h2><p>Kamarádi z hospody, spoluhráči nebo kolegové. Každý vlastní klub, společná soutěž a derby, které má dohru i druhý den v práci.</p><Link href="/registrace" className={styles.primary}>Zakládám ligu pro naši partu ↗</Link></div><aside><span className={styles.number}>TVOJE NOVÁ ROLE</span><h3>Zakladatel.<br />Manažer.<br /><em>Předseda.</em></h3><p>Ty ligu odstartuješ a automaticky se staneš jejím prvním předsedou. Pozveš ostatní, společně soutěž rozvíjíte a vaše kluby bojují o čest okresu.</p><p className={styles.micro}>Další vedení ligy už určují herní pravidla a volby.</p></aside></section>

    <section id="jak-to-funguje" className={styles.steps}><div className={styles.sectionTop}><p className={styles.eyebrow}>OD NÁPADU K PRVNÍMU DERBY</p><h2>Ty dodáš partu. My váš okres.</h2></div><ol>{[
      ["Vybereš svůj okres", "Napíšeš jméno, e-mail a vybereš okres. Teď ještě neřešíš tým, sestavu ani heslo."],
      ["Do 24 hodin připravíme data", "Doplníme místní jména, obce, sponzory a atmosféru okresu. Stejně jako už u Prachatic a Prahy."],
      ["Odemkneme registraci týmů", "Dostaneš aktivační odkaz. Založíš svůj klub a pozveš kamarády do připraveného okresu."],
    ].map(([title, copy], i) => <li key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol><div className={styles.localNote}><strong>Prachatice mají svůj Prales. Praha taky.</strong><p>Každý okres má jiný charakter. Ten váš dostane vlastní místní data, aby to od první návštěvy bylo opravdu u vás doma.</p></div></section>

    <section className={styles.faq}><h2>Ještě než pískneme začátek.</h2>{[
      ["Musíme být celá parta hned od začátku?", "Nemusíte. Ligu můžeš rozjet ty a kamarády pozvat postupně. Volné kluby v soutěži vedou počítačoví manažeři. S vlastní partou ale mají derby úplně jiný náboj."],
      ["Co přesně znamenají data pro náš okres?", "Skutečné obce a místní názvy, příjmení, sponzoři a další reálie, které dávají hře místní atmosféru. Nejde o kopii soupisek skutečných klubů — hráči a jejich příběhy vznikají ve hře."],
      ["Kdy si můžeme založit týmy?", "Až dokončíme přípravu vašeho okresu. Do 24 hodin od registrace připravíme personalizovaná data a pošleme další postup. Pak se pro daný okres otevře registrace týmů."],
      ["Můj okres už ve hře je. Co dál?", "V registraci uvidíš, které okresy už mají otevřenou ligu. Do připraveného okresu se můžeš připojit jako manažer. Předsedou existující ligy se tím automaticky nestáváš."],
    ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>

    <section className={styles.finalCta}><p className={styles.eyebrow}>VÁŠ OKRES ČEKÁ NA VÝKOP</p><h2>Tak kdo to u vás<br /><em>vezme do ruky?</em></h2><Link href="/registrace" className={styles.primary}>Založit vlastní ligu ↗</Link><p>Jméno. E-mail. Okres. O zbytek se postaráme.</p></section>
    <footer className={styles.footer}><Link href="/" className={styles.logo}>PRALES.</Link><span>Velký příběhy malýho fotbalu.</span><Link href="/prihlaseni">Už hraju → Přihlásit se</Link></footer>
  </main>;
}
