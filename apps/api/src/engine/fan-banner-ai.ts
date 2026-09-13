/**
 * Zadání pro model, který píše na plachtu.
 *
 * Plachta není chorál. Chorál se křičí a opakuje, plachta se čte jednou z
 * druhé strany hřiště: musí to být jedno heslo, které je vidět a hned
 * pochopitelné. Proto vlastní prompt, ale stejná kontrolní branka
 * (`zkontrolujChoral`), protože chyby, kterých se model dopouští, jsou tytéž.
 *
 * Šablony v `fan-banner.ts` zůstávají jako záloha. Když model vrátí patvar,
 * na stadionu visí obyčejné, ale správné heslo, ne rozbitý text.
 */

import type { Transparent } from "./fan-banner";

export type BannerTon = Transparent["tone"];

/** Co má heslo na dané téma dělat. */
export const ZADANI_TONU: Record<BannerTon, string> = {
  podpora:
    "Podpora vlastního týmu. Hrdé, ne uslintané. Bez posměchu komukoli.",
  proti_soupefi:
    "Proti konkrétnímu soupeři. Hrubé, krátké, hloupé. Žádné slovní hříčky, "
    + "spíš posměch a nadřazenost. NIKDY jim nefandi.",
  proti_treneru:
    "Volání po odvolání trenéra. Tvrdé a adresné, jeho příjmení zazní. "
    + "Je to hněv, ne argument.",
  pro_trenera:
    "Poděkování trenérovi. Bere se mezi svoje, jeho příjmení zazní.",
  proti_hraci:
    "Proti konkrétnímu hráči vlastního týmu. Kotel ho chce pryč. Jeho "
    + "příjmení zazní. Tvrdé, ale ne výhrůžka.",
  vytka:
    "Výtka vlastnímu klubu nebo vedení. Naštvané, ale pořád je to jejich klub.",
};

/**
 * Pravidla stavby hesla.
 *
 * Poslední bod je tvrdý ze stejného důvodu jako u chorálů: česká jména nejde
 * spolehlivě ohnout bez morfologie a patvar je na plachtě vidět přes celé
 * hřiště.
 */
export const STAVBA_TRANSPARENTU: readonly string[] = [
  "JEDNO heslo, ne věta a ne dvě věty. Čte se z druhé strany hřiště.",
  "Krátké. Čím kratší, tím větší písmo a tím líp je to vidět.",
  "Velká písmena se doplní sama, neřeš je.",
  "Žádná čísla, žádné datum, žádná statistika.",
  "Piš ČESKY. Ani jedno anglické slovo, tohle je okresní přebor.",
  "Hovorová čeština. Klidně tvrdá, ale ne návod k násilí a ne rasismus.",
  "JMÉNA A NÁZVY NECHÁVEJ V PRVNÍM PÁDĚ. Postav heslo tak, aby se jméno "
    + "nemuselo ohýbat.",
  "Vrať POUZE text hesla. Žádné uvozovky, žádné vysvětlení, žádné varianty.",
];

/** Sestaví zadání. Fakta jsou hotové věty, model si nic nedomýšlí. */
export function promptTransparentu(opts: {
  ton: BannerTon;
  fakta: string[];
  klub: string;
  okres?: string | null;
  maxDelka: number;
  povinneSlovo?: string | null;
}): string {
  return [
    "Jsi člen kotle amatérského fotbalového klubu v českém okresním přeboru.",
    `Klub se jmenuje ${opts.klub}.`,
    opts.okres ? `Hraje se na ${opts.okres}ku, mluv jako místní.` : "",
    "",
    "Napiš heslo na plachtu, kterou kotel vyvěsí přes celý sektor.",
    `Vejde se nejvýš ${opts.maxDelka} znaků včetně mezer. Delší se nevejde a zahodí se.`,
    "",
    `ZADÁNÍ: ${ZADANI_TONU[opts.ton]}`,
    opts.povinneSlovo ? `V hesle MUSÍ zaznít: ${opts.povinneSlovo}` : "",
    "",
    "FAKTA, ze kterých smíš čerpat (nic jiného nevíš a nic si nepřidávej):",
    ...opts.fakta.map((f) => `- ${f}`),
    "",
    "JAK SE HESLO NA PLACHTU PÍŠE:",
    ...STAVBA_TRANSPARENTU.map((p) => `- ${p}`),
  ].filter(Boolean).join("\n");
}
