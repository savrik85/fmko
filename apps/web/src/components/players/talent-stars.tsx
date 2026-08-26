"use client";

/**
 * Hvězdičkové hodnocení potenciálu — à la Football Manager.
 *
 * Plné hvězdy = co hráč umí dnes, průsvitné = kam ho podle skauta pustí strop.
 * Text „Na střídání to bude stačit" v modrém rámečku nikoho nedojal; hvězdy vidí manažer
 * na první pohled a hned pozná klenot od výplně.
 *
 * Škála je RELATIVNÍ k tomu, co klub má: strop jeho opor jsou čtyři hvězdy, takže pátá
 * zůstává pro kluka, který je všechny přeroste. V okresním přeboru tak pět hvězd znamená
 * něco jiného než v krajském — a přesně to manažera zajímá.
 */

const POCET_HVEZD = 5;

/** Kolik hvězd (0–5, po půlkách) odpovídá danému hodnocení. */
function naHvezdy(hodnota: number, stropOpor: number): number {
  const skala = Math.max(20, stropOpor * 1.25);
  return Math.max(0, Math.min(POCET_HVEZD, Math.round((hodnota / skala) * POCET_HVEZD * 2) / 2));
}

function Hvezda({ vypln, barva, klic, obrys }: { vypln: number; barva: string; klic: string; obrys?: string }) {
  const cesta = "M12 2.5l2.9 6.3 6.6.8-4.9 4.6 1.3 6.8L12 17.7 6.1 21l1.3-6.8L2.5 9.6l6.6-.8z";
  const idVyplne = `hv-${klic}`;

  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id={idVyplne}>
          <stop offset={`${vypln * 100}%`} stopColor={barva} />
          <stop offset={`${vypln * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d={cesta}
        fill={`url(#${idVyplne})`}
        stroke={obrys ?? "none"}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface TalentStarsProps {
  /** Aktuální hodnocení hráče. */
  hodnoceni: number;
  /** Odhadovaný strop (null = klub nemá skauta a nevidí ho). */
  odhadStropu: number | null;
  /** Strop opor A-týmu — určuje škálu. */
  stropOpor: number;
  /** Menší provedení do karty v seznamu. */
  kompaktni?: boolean;
  /** Unikátní klíč kvůli SVG gradientům na jedné stránce. */
  klic: string;
  /**
   * Verdikt z API. Určuje barvu — zlaté hvězdy musí padnout právě na hráče, kterého
   * odznak označí za klenota. Dřív se barva odvozovala z počtu hvězd, což je jiná škála,
   * takže vznikaly zlaté hvězdy vedle odznaku „Výhled: sestava".
   */
  uroven?: "hvezda" | "nadejny" | "prumer" | "slaby" | null;
}

export function TalentStars({ hodnoceni, odhadStropu, stropOpor, kompaktni, klic, uroven }: TalentStarsProps) {
  const ted = naHvezdy(hodnoceni, stropOpor);
  const strop = odhadStropu !== null ? Math.max(ted, naHvezdy(odhadStropu, stropOpor)) : ted;

  // Potenciál musí být vidět na první pohled — proto plná světlá výplň, ne průsvitná
  // vrstva. Ta se na béžovém pozadí ztrácela a klenot se stropem 86 vypadal stejně jako
  // průměrný kluk se stropem 65.
  // Zlatá se řídí verdiktem z API, ne počtem hvězd. Hvězdy škálují podle stropu opor,
  // odznak podle pásem kádru — bez tohohle svítily hvězdy zlatě i hráči s odznakem
  // „Výhled: sestava". Bez známé úrovně se spadne zpět na počet hvězd.
  const jeKlenot = uroven ? uroven === "hvezda" : strop >= 4.5;
  const barvaStropu = jeKlenot ? "#F0D060" : strop >= 3 ? "#81C784" : "#D6D1C9";
  const barvaTed = jeKlenot ? "#C4A035" : "#2D5F2D";

  return (
    <div
      // V kompaktním režimu bez mezer — pět hvězd po 16 px se do boxu na čtvrtinu
      // mobilní šířky nevejde a poslední se ořízne.
      className={`flex items-center ${kompaktni ? "gap-0" : "gap-0.5"}`}
      title={`Teď ${hodnoceni}${odhadStropu !== null ? `, strop ~${odhadStropu}` : ""}`}
    >
      {Array.from({ length: POCET_HVEZD }, (_, i) => {
        const poziceHvezdy = i + 1;
        // Kolik z téhle hvězdy zabírá současná úroveň a kolik potenciál
        const vyplnTed = Math.max(0, Math.min(1, ted - i));
        const vyplnStrop = Math.max(0, Math.min(1, strop - i));

        return (
          <span key={i} className={`relative inline-block ${kompaktni ? "w-3.5 h-3.5" : "w-5 h-5"}`}>
            {/* Kam až může dojít */}
            <span className="absolute inset-0">
              <Hvezda vypln={vyplnStrop} barva={barvaStropu} obrys="#C9C2B8" klic={`${klic}-s-${poziceHvezdy}`} />
            </span>
            {/* Co umí dnes — přes potenciál */}
            <span className="absolute inset-0">
              <Hvezda vypln={vyplnTed} barva={barvaTed} klic={`${klic}-t-${poziceHvezdy}`} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
