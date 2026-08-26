"use client";

/**
 * Rozvoj dorostu — kdo z kluků má na áčko a za jak dlouho.
 *
 * Karty místo řádků: na širokém monitoru byl verdikt přes celou obrazovku daleko od jména
 * a nedalo se to číst. Strop je vždycky ODHAD skauta (rozpětí), nikdy přesné číslo z databáze.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PositionBadge } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { TalentStars } from "@/components/players/talent-stars";

interface HracRozvoje {
  id: string;
  jmeno: string;
  vek: number;
  pozice: string;
  hodnoceni: number;
  avatar: string | null;
  strop: number | null;
  rozptylStropu: number | null;
  talent: number | null;
  nadejnost: { slovne: string; uroven: "hvezda" | "nadejny" | "prumer" | "slaby" } | null;
  rustZa120Dni: number;
  sezonDoAcka: number | null;
  pripravenyDoAcka: boolean;
  dospivaniLetos: number;
}

interface RozvojData {
  maU21: boolean;
  latka: { prumerKadru: number | null; zakladniSestava: number | null; cil: number; stropOpor?: number } | null;
  maSkauta: boolean;
  hraci: HracRozvoje[];
}

const BARVA_UROVNE: Record<string, string> = {
  hvezda: "bg-gold-50 text-gold-700 border-gold-300",
  nadejny: "bg-pitch-50 text-pitch-600 border-pitch-300",
  prumer: "bg-blue-50 text-blue-600 border-blue-200",
  slaby: "bg-gray-100 text-muted border-gray-200",
};

/** Avatar přichází z API jako JSON string; rozbitý znamená prostě prázdný obličej. */
function parsujAvatar(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch (e) { console.warn("avatar parse:", e); return {}; }
}

/** Kdy se dotáhne — krátce, do rohu karty. */
function kdy(h: HracRozvoje): { text: string; barva: string } {
  if (h.pripravenyDoAcka) return { text: "Už na to má", barva: "bg-pitch-500 text-white" };
  if (h.sezonDoAcka === 1) return { text: "Za sezónu", barva: "bg-gold-500 text-white" };
  if (h.sezonDoAcka === 2) return { text: "Za 2 sezóny", barva: "bg-gold-100 text-gold-700" };
  if (h.sezonDoAcka && h.sezonDoAcka <= 4) return { text: `Za ${h.sezonDoAcka} sezóny`, barva: "bg-gray-100 text-ink" };
  if (h.sezonDoAcka) return { text: `Za ${h.sezonDoAcka} sezón`, barva: "bg-gray-100 text-muted" };
  return { text: "Nedotáhne se", barva: "bg-gray-100 text-muted" };
}

type Razeni = "nejdriv" | "potencial" | "vek" | "hodnoceni";
type FiltrPozice = "vse" | "GK" | "DEF" | "MID" | "FWD";

const RAZENI: Array<{ klic: Razeni; popis: string }> = [
  { klic: "nejdriv", popis: "Kdo dřív" },
  { klic: "potencial", popis: "Potenciál" },
  { klic: "hodnoceni", popis: "Hodnocení" },
  { klic: "vek", popis: "Věk" },
];

const POZICE: Array<{ klic: FiltrPozice; popis: string }> = [
  { klic: "vse", popis: "Vše" },
  { klic: "GK", popis: "Brankáři" },
  { klic: "DEF", popis: "Obrana" },
  { klic: "MID", popis: "Záloha" },
  { klic: "FWD", popis: "Útok" },
];

export function U21Rozvoj({ teamId }: { teamId: string }) {
  const [data, setData] = useState<RozvojData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [razeni, setRazeni] = useState<Razeni>("nejdriv");
  const [pozice, setPozice] = useState<FiltrPozice>("vse");
  // Dorost bývá dvacet kluků — bez filtru a řazení se v tom nedá vyznat
  const [jenNadejni, setJenNadejni] = useState(false);

  useEffect(() => {
    apiFetch<RozvojData>(`/api/teams/${teamId}/u21/rozvoj`)
      .then((d) => { setData(d); setLoaded(true); })
      .catch((e) => { console.error("u21 rozvoj load:", e); setLoaded(true); });
  }, [teamId]);

  if (!loaded) return null;
  if (!data?.maU21) return <div className="card p-4 text-sm text-muted">Klub nemá dorostenecký tým.</div>;

  const cil = data.latka?.cil ?? 45;
  // Škála hvězd: strop opor áčka jsou čtyři hvězdy, pátá zůstává pro toho, kdo je přeroste
  const stropOpor = data.latka?.stropOpor ?? cil + 15;
  const vyfiltrovani = data.hraci
    .filter((h) => pozice === "vse" || h.pozice === pozice)
    .filter((h) => !jenNadejni || h.nadejnost?.uroven === "hvezda" || h.nadejnost?.uroven === "nadejny");

  const serazeni = [...vyfiltrovani].sort((a, b) => {
    switch (razeni) {
      case "potencial":
        return (b.strop ?? 0) - (a.strop ?? 0);
      case "hodnoceni":
        return b.hodnoceni - a.hodnoceni;
      case "vek":
        return a.vek - b.vek;
      default: {
        // Kdo dřív prorazí — připravení nahoru, pak podle počtu sezón
        if (a.pripravenyDoAcka !== b.pripravenyDoAcka) return a.pripravenyDoAcka ? -1 : 1;
        const sa = a.sezonDoAcka ?? 99, sb = b.sezonDoAcka ?? 99;
        if (sa !== sb) return sa - sb;
        return b.hodnoceni - a.hodnoceni;
      }
    }
  });

  // Souhrn nahoře popisuje CELÝ dorost, ne aktuální filtr — jinak by čísla skákala
  const pripraveni = data.hraci.filter((h) => h.pripravenyDoAcka).length;
  const doTri = data.hraci.filter((h) => !h.pripravenyDoAcka && h.sezonDoAcka !== null && h.sezonDoAcka <= 3).length;

  // Kluk s nejvyšším stropem — hlavní sdělení celé stránky
  const nadeje = data.maSkauta
    ? [...data.hraci].sort((a, b) => (b.strop ?? 0) - (a.strop ?? 0))[0] ?? null
    : null;

  // Společná škála pro pruhy, ať jdou karty mezi sebou porovnat
  const maxHodnota = Math.max(cil, ...data.hraci.map((h) => Math.max(h.hodnoceni, h.strop ?? 0)));
  const skala = Math.ceil(maxHodnota / 10) * 10;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / skala) * 100))}%`;

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="font-heading font-bold text-base">Rozvoj dorostu</h2>
          <span className="text-sm text-muted">
            Laťka áčka <strong className="text-ink font-heading tabular-nums">{cil}</strong>
          </span>
        </div>

        {/* Největší naděje na prvním místě — kvůli ní sem manažer chodí. Čtyři stejně velké
            boxy vedle sebe nedávaly hierarchii a „18 klenotů z 18" navíc nic neříkalo. */}
        {nadeje && (
          <Link
            href={`/dashboard/player/${nadeje.id}`}
            className="flex items-center gap-3 mt-3 p-3 rounded-soft bg-gold-50 border border-gold-200 hover:border-gold-300 transition"
          >
            <div className="shrink-0 w-11 h-11 rounded-full overflow-hidden bg-gold-100 flex items-end justify-center">
              <FaceAvatar faceConfig={parsujAvatar(nadeje.avatar)} size={37} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-micro font-heading font-bold uppercase text-gold-700">Největší naděje</div>
              <div className="font-heading font-bold text-base truncate">
                {nadeje.jmeno} <span className="text-muted font-normal text-sm">{nadeje.vek} let</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <TalentStars
                hodnoceni={nadeje.hodnoceni}
                odhadStropu={nadeje.strop}
                stropOpor={stropOpor}
                kompaktni
                klic={`nadeje-${nadeje.id}`}
                uroven={nadeje.nadejnost?.uroven}
              />
              {nadeje.strop !== null && (
                <div className="text-sm tabular-nums text-muted mt-0.5">{nadeje.hodnoceni} → {nadeje.strop}</div>
              )}
            </div>
          </Link>
        )}

        {/* Čísla na jeden řádek — jsou to doplňky, ne hlavní sdělení */}
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-3 text-sm">
          <span>
            <strong className="font-heading tabular-nums text-pitch-600">{pripraveni}</strong>
            <span className="text-muted"> už na áčko má</span>
          </span>
          <span>
            <strong className="font-heading tabular-nums text-ink">{doTri}</strong>
            <span className="text-muted"> do tří sezón</span>
          </span>
          <span>
            <strong className="font-heading tabular-nums text-ink">{data.hraci.length}</strong>
            <span className="text-muted"> kluků v dorostu</span>
          </span>
          {!data.maSkauta && (
            <span className="text-muted">Bez skauta neuvidíš stropy — najmi ho v Zaměstnancích.</span>
          )}
        </div>
      </section>

      {/* Ovládání v jednom řádku. Tlačítka pro každou volbu se na mobilu zalamovala
          do čtyř řádků; select otevře nativní picker a zabere jeden. */}
      <section className="card p-3 flex items-center gap-2 flex-wrap">
        <select
          value={razeni}
          onChange={(e) => setRazeni(e.target.value as Razeni)}
          className="select text-sm py-2"
          aria-label="Řadit podle"
        >
          {RAZENI.map((r) => <option key={r.klic} value={r.klic}>Řadit: {r.popis}</option>)}
        </select>

        <select
          value={pozice}
          onChange={(e) => setPozice(e.target.value as FiltrPozice)}
          className="select text-sm py-2"
          aria-label="Filtr pozice"
        >
          {POZICE.map((p) => <option key={p.klic} value={p.klic}>{p.klic === "vse" ? "Všechny pozice" : p.popis}</option>)}
        </select>

        <button
          onClick={() => setJenNadejni((v) => !v)}
          className={`text-sm px-3 py-2 rounded-control font-heading font-bold transition ${
            jenNadejni ? "bg-gold-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
          }`}
          title="Jen kluci, ze kterých může být hráč do sestavy nebo tahoun"
        >✨ Jen nadějní</button>

        {serazeni.length !== data.hraci.length && (
          <span className="text-sm text-muted ml-auto">{serazeni.length} z {data.hraci.length}</span>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {serazeni.length === 0 && (
          <div className="card p-4 text-sm text-muted lg:col-span-2">
            Tomuhle filtru neodpovídá žádný kluk.
          </div>
        )}
        {serazeni.map((h) => {
          const k = kdy(h);
          const ramecek = h.nadejnost ? BARVA_UROVNE[h.nadejnost.uroven] : "border-gray-200";
          const rozptyl = h.rozptylStropu ?? 0;

          return (
            <div key={h.id} className={`card p-4 border ${h.nadejnost?.uroven === "hvezda" ? "border-gold-300" : "border-transparent"}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-11 h-11 rounded-full overflow-hidden bg-gray-100 flex items-end justify-center">
                  {/* size = strana / 1,2 — obličej se kreslí na výšku, jinak se ořízne brada */}
                  <FaceAvatar faceConfig={parsujAvatar(h.avatar)} size={37} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Link href={`/dashboard/player/${h.id}`} className="font-heading font-bold text-base hover:underline">
                      {h.jmeno}
                    </Link>
                    <PositionBadge position={h.pozice} />
                    <span className="text-sm text-muted">{h.vek} let</span>
                  </div>

                  {h.nadejnost && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <TalentStars
                        hodnoceni={h.hodnoceni}
                        odhadStropu={h.strop}
                        stropOpor={stropOpor}
                        kompaktni
                        klic={h.id}
                        uroven={h.nadejnost?.uroven}
                      />
                      <span className={`text-sm px-2 py-0.5 rounded-full font-heading font-bold border whitespace-nowrap ${ramecek}`}>
                        {h.nadejnost.uroven === "hvezda" ? "✨ " : ""}{h.nadejnost.slovne}
                      </span>
                    </div>
                  )}
                </div>

                <span className={`shrink-0 text-sm px-2.5 py-1 rounded-full font-heading font-bold whitespace-nowrap ${k.barva}`}>
                  {k.text}
                </span>
              </div>

              {/* Kde je teď (plná), kam až podle odhadu (světlá), laťka áčka (čárka) */}
              <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden mt-3 mb-2">
                {h.strop !== null && (
                  <div className="absolute inset-y-0 left-0 bg-pitch-100" style={{ width: pct(h.strop) }} />
                )}
                <div
                  className={`absolute inset-y-0 left-0 ${h.pripravenyDoAcka ? "bg-pitch-500" : "bg-pitch-300"}`}
                  style={{ width: pct(h.hodnoceni) }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: pct(cil) }} />
              </div>

              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-sm">
                <span className="tabular-nums">
                  <strong className="font-heading text-ink text-base">{h.hodnoceni}</strong>
                  {h.strop !== null ? (
                    <span className="text-muted"> → odhad {Math.max(h.hodnoceni, h.strop - rozptyl)}–{Math.min(100, h.strop + rozptyl)}</span>
                  ) : (
                    <span className="text-muted"> → strop neznámý</span>
                  )}
                </span>
                {h.dospivaniLetos > 0 && (
                  <span className="text-pitch-500 font-heading font-bold tabular-nums">+{h.dospivaniLetos} dospíváním</span>
                )}
                {h.rustZa120Dni > 0 && (
                  <span className="text-muted tabular-nums">+{h.rustZa120Dni} tréninkem</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
