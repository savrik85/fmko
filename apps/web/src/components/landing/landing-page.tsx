"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import styles from "./landing.module.css";

type LandingData = {
  stats: { matches: number; players: number; villages: number; districts: number };
  results: Array<{ home: string; away: string; homeScore: number; awayScore: number; league: string; at: string }>;
  headlines: Array<{ headline: string; league: string; type: string }>;
  districts: Array<{ name: string; villages: number; managers: number; founderFree: boolean }>;
};

const HEADLINE_LABEL: Record<string, string> = {
  ai_report: "Zpravodaj kola",
  player_interview: "Rozhovor",
  ultras_report: "Z kotle",
  season_wrap: "Konec sezóny",
  celebrity_arrival: "Přestupy",
  legend_farewell: "Loučení",
};

// Skutečné zprávy, které hráčům ve hře chodí do telefonu (výmluvy z events/absence.ts).
const PHONE_MESSAGES = [
  { from: "Horák (útočník)", text: "Dneska to nestíhám, je to daleko a mám ještě směnu" },
  { from: "Kučera (brankář)", text: "Myslel jsem že brčály jsou nealko. Nebyly" },
  { from: "Novotný (obránce)", text: "Kolega co mě veze onemocněl, nemám jak se dostat" },
];

const MOMENTS = [
  ["Kabina", "Každý hráč má práci, povahu a vlastní život. Útočník má ranní směnu, brankář včera zavíral hospodu. Na hřišti se to pozná."],
  ["Zápas", "Sestava, taktika a střídání. Zápas sleduješ s komentářem, který patří na okres, a po něm tě čeká rozhovor pro místní noviny."],
  ["Klub", "Jméno, barvy, dres i stadion. Jednáš s místními firmami o sponzoringu, hlídáš rozpočet a staráš se o fanoušky."],
  ["Liga", "Vaše soutěž má předsedu, schůze a hlasování. Pod přeborem hraje III. třída, nejlepší postupují, nejhorší padají."],
];

function czNumber(n: number): string {
  return n.toLocaleString("cs-CZ");
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function LandingPage({ redirectPlayers = true }: { redirectPlayers?: boolean }) {
  const { teamId, isLoading } = useTeam();
  const router = useRouter();
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => { if (redirectPlayers && !isLoading && teamId) router.replace("/prehled"); }, [redirectPlayers, teamId, isLoading, router]);
  useEffect(() => {
    apiFetch<LandingData>("/api/public/landing").then(setData).catch((e) => console.warn("Data ze hry pro úvod se nenačetla:", e));
  }, []);
  const freeDistricts = data?.districts.filter((d) => d.founderFree) ?? [];
  const playedDistricts = data?.districts.filter((d) => !d.founderFree) ?? [];

  return <main className={styles.site}>
    <header className={styles.nav}>
      <Link href="/" className={styles.logo} aria-label="Prales. Úvod">PRA<span>L</span>ES<span className={styles.logoDot}>.</span></Link>
      <nav aria-label="Hlavní navigace"><a href="#hra">Jak to vypadá</a><a href="#okresy">Okresy</a><Link href="/prihlaseni">Přihlásit se <span aria-hidden="true">↗</span></Link></nav>
    </header>

    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> FOTBALOVÝ MANAŽER PRO CELOU KABINU</p>
        <h1 id="hero-title">VEDL BYS TO<br />LÍP NEŽ<br /><em>VÁŠ TRENÉR?</em></h1>
        <p className={styles.lead}>Založ s klukama z kabiny vlastní okresní ligu. Každý vede svůj klub ze skutečné obce vašeho okresu a o tom, kdo fotbalu rozumí nejvíc, rozhodne tabulka.</p>
        <div className={styles.actions}><Link href="/registrace" className={styles.primary}>Založit ligu pro kabinu <span aria-hidden="true">↗</span></Link><a href="#hra" className={styles.textLink}>Jak to vypadá ↓</a></div>
        <p className={styles.micro}>Zdarma · v prohlížeči na mobilu, nic se neinstaluje · pár minut denně</p>
      </div>
      <div className={styles.heroArt}>
        <img src="/images/prales-okres.webp" alt="Vesnické fotbalové hřiště, klubovna a česká krajina v podvečerním slunci" width="1536" height="1024" fetchPriority="high" />
        <div className={styles.artCaption}><span>SKUTEČNÉ OBCE. VYMYŠLENÍ HRÁČI.</span><strong>Vaše derby, vaše hospoda.</strong></div>
      </div>
    </section>

    <div className={styles.strip}>
      <span><strong className={styles.stripNum}>{data ? czNumber(data.stats.matches) : "…"}</strong> odehraných zápasů</span>
      <span><strong className={styles.stripNum}>{data ? czNumber(data.stats.players) : "…"}</strong> hráčů s vlastním příběhem</span>
      <span><strong className={styles.stripNum}>{data ? czNumber(data.stats.villages) : "…"}</strong> skutečných obcí</span>
      <span><strong className={styles.stripNum}>{data ? data.stats.districts : "…"}</strong> okresů ve hře</span>
    </div>

    <section id="hra" className={styles.showcase} aria-labelledby="showcase-title">
      <div className={styles.sectionTop}><p className={styles.eyebrow}>TAKHLE TO VYPADÁ VE HŘE</p><h2 id="showcase-title">Neděle v devět ráno.<br /><em>Telefon nepřestává pípat.</em></h2></div>
      <div className={styles.showcaseGrid}>
        <div className={styles.phone} aria-label="Ukázka zpráv od hráčů ve hře">
          <p className={styles.phoneTop}>Zprávy · zápasový den</p>
          {PHONE_MESSAGES.map((m) => <div key={m.from} className={styles.bubble}><strong>{m.from}</strong><span>{m.text}</span></div>)}
          <p className={styles.phoneNote}>Ukázka zpráv, které hráči ve hře opravdu posílají.</p>
        </div>
        <div className={styles.moments}>{MOMENTS.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </div>
    </section>

    {data && (data.results.length > 0 || data.headlines.length > 0) && <section className={styles.live} aria-labelledby="live-title">
      <div className={styles.sectionTop}><p className={styles.eyebrow}><span className={styles.liveDot} /> PRÁVĚ TEĎ V PRALESE</p><h2 id="live-title">Tohle se odehrálo<br /><em>v posledních kolech.</em></h2></div>
      <div className={styles.liveGrid}>
        {data.results.length > 0 && <div><h3 className={styles.liveHeading}>Výsledky</h3><ul className={styles.results}>{data.results.map((r, i) => <li key={i}>
          <span className={styles.resultTeams}>{r.home} <b>{r.homeScore}:{r.awayScore}</b> {r.away}</span>
          <span className={styles.resultMeta}>{r.league} · {shortDate(r.at)}</span>
        </li>)}</ul></div>}
        {data.headlines.length > 0 && <div><h3 className={styles.liveHeading}>Ze zpravodaje</h3><ul className={styles.headlines}>{data.headlines.map((h, i) => <li key={i}>
          <span className={styles.resultMeta}>{HEADLINE_LABEL[h.type] ?? "Zpravodaj"} · {h.league}</span>
          <strong>{h.headline}</strong>
        </li>)}</ul></div>}
      </div>
    </section>}

    <section className={styles.friends}><div><p className={styles.eyebrow}>CELÁ KABINA, JEDNA LIGA</p><h2>V kabině jste experti.<br /><em>Tak to ukažte v lize.</em></h2><p>Každý z party vede vlastní klub, všichni hrajete stejnou soutěž. Derby má dohru v kabině, na tréninku i v hospodě. Volná místa v lize zatím obsadí počítačové kluby, kamarády můžeš zvát postupně.</p><Link href="/registrace" className={styles.primary}>Zakládám ligu pro naši partu ↗</Link></div><aside><span className={styles.number}>KDO ZALOŽÍ PRVNÍ</span><h3>Zakladatel.<br />Manažer.<br /><em>Předseda.</em></h3><p>Kdo v prázdném okrese založí klub jako první, povede ligu jako předseda na první období. Rozhoduje o pravidlech soutěže a zve ostatní kluby z okolí.</p><p className={styles.micro}>Další vedení ligy určují herní pravidla a volby.</p></aside></section>

    <section id="okresy" className={styles.steps} aria-labelledby="districts-title">
      <div className={styles.sectionTop}><p className={styles.eyebrow}>OKRESY VE HŘE</p><h2 id="districts-title">Vyber svůj okres.</h2></div>
      {freeDistricts.length > 0 && <div className={styles.freeDistricts}>{freeDistricts.map((d) => (
        <Link key={d.name} href={`/registrace?okres=${encodeURIComponent(d.name)}`} className={styles.freeCard}>
          <span className={styles.freeTag}>Volný okres</span>
          <strong>{d.name}</strong>
          <span className={styles.freeMeta}>{d.villages} obcí s fotbalovým klubem · zatím bez manažerů</span>
          <span className={styles.freeCta}>Zaber jako první a veď ligu <span aria-hidden="true">↗</span></span>
        </Link>
      ))}</div>}
      {playedDistricts.length > 0 && <div className={styles.playedBlock}>
        <p className={styles.playedTitle}>Už se hraje</p>
        <ul className={styles.playedList}>{playedDistricts.map((d) => <li key={d.name}>
          <Link href={`/registrace?okres=${encodeURIComponent(d.name)}`}>
            <strong>{d.name}</strong>
            <span className={styles.playedMeta}>{d.managers >= 5 ? `${d.managers} manažerů` : "Volná místa v lize"} · {d.villages} obcí</span>
            <span className={styles.playedCta}>Přidat se <span aria-hidden="true">→</span></span>
          </Link>
        </li>)}</ul>
      </div>}
      <div className={styles.localNote}><strong>Váš okres tu není?</strong><p>Pošli žádost. Připravíme skutečné obce, místní příjmení a firmy z vašeho okolí a ozveme se, jakmile bude okres připravený. Kdo žádost pošle první, povede tamní ligu jako předseda. <Link href="/registrace" className={styles.inlineLink}>Poslat žádost</Link></p></div>
    </section>

    <section className={styles.faq}><h2>Ještě než pískneme začátek.</h2>{[
      ["Kolik to stojí?", "Nic. Hra je zdarma a hraje se v prohlížeči, na mobilu i na počítači. Nic se neinstaluje."],
      ["Kolik času to zabere?", "Pár minut denně. Zápasy se hrají dvakrát týdně v podvečer, mezi nimi řešíš trénink, sestavu, přestupy a telefon od hráčů."],
      ["Musíme být celá parta hned od začátku?", "Nemusíte. Ligu můžeš rozjet sám a kamarády pozvat postupně. Volné kluby zatím vedou počítačoví manažeři. S vlastní partou ale mají derby úplně jiný náboj."],
      ["Jsou to skutečné kluby a hráči?", "Obce, místní příjmení i firmy jsou skutečné. Hráči, jejich příběhy a výsledky vznikají ve hře. Nejde o kopii soupisek skutečných klubů."],
      ["Co když je naše liga plná?", "Pod přeborem se otevře III. třída. Na konci sezóny dva nejlepší postupují a dva nejhorší sestupují."],
    ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>

    <section className={styles.finalCta}><p className={styles.eyebrow}>SEZÓNA ZAČÍNÁ</p><h2>Tak kdo z vás<br /><em>to vezme do ruky?</em></h2><Link href="/registrace" className={styles.primary}>Založit ligu pro kabinu ↗</Link><p>Zdarma. Jméno, e-mail, heslo a jdeš na hřiště.</p></section>
    <footer className={styles.footer}><Link href="/" className={styles.logo}>PRALES.</Link><span>Velký příběhy malýho fotbalu.</span><Link href="/prihlaseni">Už hraju → Přihlásit se</Link></footer>
  </main>;
}
