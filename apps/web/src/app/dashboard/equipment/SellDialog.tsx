"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { EQUIPMENT_ICONS, condBarColor, condColor, formatCZK, type SellOption } from "./types";

interface Props {
  option: SellOption | null;
  busy: boolean;
  onClose: () => void;
  onList: (category: string, price: number) => void;
  onPawn: (category: string) => void;
  onRepair: (category: string) => void;
}

/**
 * Dvě cesty ven z jedné kategorie. Záměrně v jednom dialogu, ne dvě tlačítka na kartě —
 * hráč se má rozhodovat mezi nimi, ne je potkávat odděleně.
 */
export function SellDialog({ option, busy, onClose, onList, onPawn, onRepair }: Props) {
  const [price, setPrice] = useState(0);
  // Zastavárna je nevratná, takže chce potvrzení — ale JEN uvnitř tohohle dialogu.
  // useConfirm() se tu použít nesmí: jeho dialog by se otevřel nad modalem a hráč
  // by klikal do prázdna (viz komentář u z-indexu v confirm-dialog.tsx).
  const [pawnArmed, setPawnArmed] = useState(false);

  useEffect(() => {
    if (option) {
      setPrice(option.bazarSuggested);
      setPawnArmed(false);
    }
  }, [option]);

  if (!option) return null;

  // Jen spodní mez — nahoru si řekni, co chceš, buď to někdo koupí, nebo ne.
  const priceValid = price >= option.bazarMin;
  // Cenu opravy počítá server (úměrná hodnotě kusu a tomu, jak je sešlý).
  const repairCost = option.repairCost;
  const worn = repairCost > 0;

  return (
    <Modal isOpen={!!option} onClose={onClose} maxWidth="34rem">
      <div className="p-5 space-y-4">
        {/* Hlavička */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{EQUIPMENT_ICONS[option.category] ?? "📦"}</span>
          <div className="flex-1 min-w-0">
            <div className="font-heading font-bold text-lg">Prodat: {option.label}</div>
            <div className="text-sm text-muted">
              Úroveň {option.level} · stav{" "}
              <span className={`font-heading font-bold ${condColor(option.condition)}`}>{option.condition} %</span>
            </div>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${condBarColor(option.condition)}`} style={{ width: `${option.condition}%` }} />
        </div>

        {worn && (
          <div className="bg-gold-50 border border-gold-200 rounded-lg p-3 text-sm">
            <div className="text-ink">
              Opotřebené vybavení se prodává hůř. Oprava za{" "}
              <span className="font-heading font-bold">{formatCZK(repairCost)}</span> zvedne stav na 100 % a s ním i cenu.
            </div>
            <button
              onClick={() => onRepair(option.category)}
              disabled={busy}
              className="mt-2 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
            >
              Nejdřív opravit
            </button>
          </div>
        )}

        {/* Bazar */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="font-heading font-bold flex items-center gap-2">🏷 Vystavit v bazaru</div>

          <div className="flex items-center gap-3">
            <input
              type="number"
              value={price}
              min={option.bazarMin}
              step={100}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-base font-heading font-bold tabular-nums focus:outline-none focus:border-pitch-400"
            />
            <span className="text-base text-muted">Kč</span>
          </div>

          <input
            type="range"
            value={Math.min(Math.max(price, option.bazarMin), option.bazarMax)}
            min={option.bazarMin}
            max={option.bazarMax}
            step={100}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full accent-pitch-500"
          />

          <div className="text-sm text-muted">
            Doporučeno{" "}
            <button onClick={() => setPrice(option.bazarSuggested)} className="font-heading font-bold text-pitch-600 hover:underline">
              {formatCZK(option.bazarSuggested)}
            </button>
            {" "}· nové vyjde na {formatCZK(option.invested)}. Nahoru se drž, jak chceš — buď to někdo koupí, nebo ne.
          </div>

          <div className="text-sm text-muted">
            Míň než {formatCZK(option.bazarMin)} nedávej, tolik za to dá zastavárna bez čekání.
          </div>

          <div className="text-sm text-muted">
            Uvidí to jen kluby z tvé ligy. Inzerát platí 7 dní a vybavení používáš dál, dokud se neprodá.
          </div>

          {!priceValid && (
            <div className="text-sm text-card-red">
              Nejmíň {formatCZK(option.bazarMin)} — pod tím se to vyplatí rovnou zastavit.
            </div>
          )}

          <button
            onClick={() => onList(option.category, price)}
            disabled={busy || !priceValid}
            className="w-full py-2.5 rounded-lg text-base font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "..." : "Vystavit v bazaru"}
          </button>
        </div>

        {/* Zastavárna */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="font-heading font-bold flex items-center gap-2">💸 Zastavárna — hned</div>
          <div className="text-sm text-muted">
            Dostaneš <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(option.pawnQuote)}</span>.
            Investoval jsi <span className="tabular-nums">{formatCZK(option.invested)}</span>. Vybavení zmizí natrvalo,
            v bazaru se už neobjeví.
          </div>

          {pawnArmed ? (
            <div className="space-y-2">
              <div className="text-sm text-card-red font-heading font-bold">
                Určitě? {option.label} zmizí a zpátky už je nekoupíš.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPawnArmed(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-lg text-base font-heading font-bold border border-gray-300 text-muted hover:text-ink transition-colors"
                >
                  Radši ne
                </button>
                <button
                  onClick={() => onPawn(option.category)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-lg text-base font-heading font-bold bg-card-red text-white hover:opacity-90 disabled:bg-gray-100 disabled:text-gray-400 transition-opacity"
                >
                  {busy ? "..." : `Zastavit za ${formatCZK(option.pawnQuote)}`}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPawnArmed(true)}
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-base font-heading font-bold border-2 border-card-red text-card-red hover:bg-card-red hover:text-white disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent transition-colors"
            >
              Do zastavárny
            </button>
          )}
        </div>

        <div className="text-sm text-card-red">
          ⚠ Po prodeji spadne {option.label} na úroveň 0 a přestanou platit její bonusy.
        </div>

        <button onClick={onClose} className="w-full py-2 text-base font-heading font-bold text-muted hover:text-ink transition-colors">
          Zpět
        </button>
      </div>
    </Modal>
  );
}
