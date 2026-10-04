/**
 * Co předseda cizího klubu odpoví na nabídku. Tón vybírá `decideAiSellerReply`,
 * tady jsou jen věty. Bez dlouhých pomlček, jako všechny texty pro hráče.
 */

import type { AiReplyTone } from "./ai-seller";
import type { Rng } from "../generators/rng";

const TEXTS: Record<AiReplyTone, string[]> = {
  agree: [
    "Dobře, plácneme si. Jestli se s klukem domluvíte, je váš.",
    "Bereme. Ať se u vás ukáže.",
    "Za tohle ho pustíme. Dejte vědět, až podepíše.",
  ],
  squeeze: [
    "Jste blízko. Dejte {amount} a máte ho.",
    "Skoro. Za {amount} si plácneme hned.",
  ],
  fair: [
    "Ještě kousek. Za {amount} jsme domluvení.",
    "Pod {amount} ho nepustíme, ale bavit se můžeme.",
    "Kluci by mě ukamenovali. {amount} a beru to.",
  ],
  firm: [
    "To je málo. Za {amount} se můžeme bavit.",
    "Kluk nám drží záložní řadu, {amount} je naše cena.",
    "Tolik vám za něj nedáme. Chceme {amount}.",
  ],
  insulted: [
    "To myslíte vážně? Za tohle nedám ani jeho kopačky. Cena je {amount}.",
    "Tohle je výsměch. Řekl jsem {amount}.",
    "S takovou nabídkou mi příště nevolejte. {amount}.",
  ],
  repeat: [
    "Posíláte mi pořád to samé. {amount}, jinak končíme.",
    "Točíme se v kruhu. Chceme {amount}.",
  ],
  final: [
    "Níž už opravdu nejdu. {amount} je poslední slovo.",
    "{amount} a ani korunu míň. Výbor by mě jinak vyhodil.",
  ],
  last_round: [
    "Naposledy: {amount}. Další kolo už nebude.",
    "Už mě to přestává bavit. {amount}, nebo konec.",
  ],
  break_off: [
    "Takhle to nemá cenu. S vámi se o něm bavit nebudeme.",
    "Končíme. Zkuste to jinde.",
    "Na tohle nemám nervy. Hráč zůstává u nás.",
  ],
};

export function aiReplyText(rng: Rng, tone: AiReplyTone, amount?: number): string {
  const text = rng.pick(TEXTS[tone]);
  return amount != null ? text.replace("{amount}", `${amount.toLocaleString("cs-CZ")} Kč`) : text;
}
