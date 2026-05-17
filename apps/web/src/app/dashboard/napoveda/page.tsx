"use client";

import Link from "next/link";
import { ATTRIBUTE_INFO, type AttrKey, type Pos } from "@/lib/attribute-info";
import { TACTIC_INFO, FORMATION_INFO, type TacticKey } from "@/lib/tactic-info";

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
const SKILL_KEYS: AttrKey[] = ["spd", "tec", "sho", "pas", "hea", "def", "gk", "sta", "str"];

export default function NapovedaPage() {
  return (
    <div className="page-container space-y-4">
      <div className="card p-4">
        <h1 className="font-heading font-[800] text-2xl mb-1">📖 Nápověda — jak hra funguje</h1>
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
          Každá pozice se hodnotí podle jiných atributů. Zelená tečka = klíčový atribut pro pozici.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 px-2 font-heading uppercase text-xs text-muted">Atribut</th>
                {(["GK", "DEF", "MID", "FWD"] as Pos[]).map((p) => (
                  <th key={p} className="text-center py-2 px-2 font-heading uppercase text-xs text-muted">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${POS_COLOR[p]}`} />
                      {POS_LABEL[p]}
                    </div>
                  </th>
                ))}
                <th className="text-left py-2 px-2 font-heading uppercase text-xs text-muted">Význam</th>
              </tr>
            </thead>
            <tbody>
              {SKILL_KEYS.map((key) => {
                const info = ATTRIBUTE_INFO[key];
                return (
                  <tr key={key} className="border-b border-gray-50">
                    <td className="py-2 px-2 font-heading font-bold">{info.label}</td>
                    {(["GK", "DEF", "MID", "FWD"] as Pos[]).map((p) => (
                      <td key={p} className="text-center py-2 px-2">
                        {info.relevantFor.includes(p) ? (
                          <span className="text-pitch-500 font-bold">✓</span>
                        ) : (
                          <span className="text-muted-light">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-xs text-muted">{info.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══ TAKTIKY ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          🎯 <span>Taktiky</span>
        </h2>
        <p className="text-sm text-muted">
          Taktika modifikuje sílu útoku, obrany a šanci na góly. Vyber tu, která sedí na tvůj tým a soupeře.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(TACTIC_INFO) as TacticKey[]).map((key) => {
            const t = TACTIC_INFO[key];
            return (
              <div key={key} className="border border-gray-200 rounded-lg p-3">
                <div className="font-heading font-bold text-sm mb-1">{t.label}</div>
                <p className="text-xs text-muted leading-relaxed">{t.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ FORMACE ═══ */}
      <section className="card p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          📋 <span>Formace</span>
        </h2>
        <p className="text-sm text-muted">
          Formace ovlivňuje, kolik máš obránců, záložníků a útočníků. Sehranost se zvyšuje hraním stejné formace.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(FORMATION_INFO).map(([key, f]) => {
            const styleBg = f.style === "offensive" ? "bg-red-50 border-red-200"
              : f.style === "defensive" ? "bg-blue-50 border-blue-200"
              : "bg-gray-50 border-gray-200";
            return (
              <div key={key} className={`border rounded-lg p-3 ${styleBg}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-heading font-bold text-base tabular-nums">{f.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">
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
              Hráč pod 60 % kondice hraje až na 60 % své síly. Regeneruje se denně podle staminy:
              vysoká stamina (≥75) = +18 %/den, nízká (&lt;25) = +7 %/den. Klesá po zápase a tréninku.
              Tip: rotuj hráče s nízkou staminou, ať se nevyčerpají.
            </p>
          </div>
          <div>
            <div className="font-heading font-bold text-sm">Morálka (0–100)</div>
            <p className="text-muted text-xs leading-relaxed">
              Ovlivňuje výkon v zápase. Výhra dá +3 až +7, prohra −2 až −5. Denně se táhne k 50 (nad 55 klesá,
              pod 45 roste). Příliš nízká morálka + nízký patriotismus = riziko odchodu hráče.
            </p>
          </div>
          <div>
            <div className="font-heading font-bold text-sm">Hra mimo pozici</div>
            <p className="text-muted text-xs leading-relaxed">
              Hráč mimo svou přirozenou pozici ztrácí ~30 % relevantních atributů. Útočník v obraně bude mít
              defense efektivně sníženou — drž hráče na jejich pozici, pokud nemusíš.
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
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Koučink</div>
            <p className="text-xs text-muted">Zvyšuje šanci hráčů na zlepšení při tréninku. Při hodnotě 80 je bonus +44 %.</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Motivace</div>
            <p className="text-xs text-muted">Bonus k morálce a výkonu hráčů v zápase. Cca +3 až +5 bodů k ratingu.</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Disciplína</div>
            <p className="text-xs text-muted">Reakce hráčů na přístup. Přísný trenér + nízká disciplína hráče = ztráta morálky.</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="font-heading font-bold text-sm mb-0.5">Rozvoj mládeže</div>
            <p className="text-xs text-muted">Bonus k tréninku pro hráče do 22 let. Při hodnotě 60 navíc +26 % k šanci na zlepšení.</p>
          </div>
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
              Déšť: technika 0.8×, zranění 1.3×. Sníh: technika 0.7×, zranění 1.4×. Při dešti zvaž taktiku Nakopávané.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ DALŠÍ ZDROJE ═══ */}
      <section className="card p-4">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2 mb-2">
          🔗 <span>Další zdroje</span>
        </h2>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/dashboard/squad" className="text-pitch-600 underline">Kádr →</Link>
            <span className="text-muted text-xs ml-2">vidíš tam atributy svých hráčů (najetí myší = nápověda)</span>
          </li>
          <li>
            <Link href="/dashboard/match" className="text-pitch-600 underline">Sestava →</Link>
            <span className="text-muted text-xs ml-2">před zápasem vidíš sílu sestavy a porovnání se soupeřem</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
