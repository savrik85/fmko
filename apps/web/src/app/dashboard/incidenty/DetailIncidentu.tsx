"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import {
  datum, kc, OBVINENI_LABEL, STAV_LABEL, STAV_TRIDA, TREST_HOTOVO, TREST_LABEL, VYSLEDEK_LABEL, ZDROJ_EMOJI,
  type AkceTrestu, type DetailIncidentuData, type VysledekObvineni,
} from "./typy";

const ODKAZ_HRACE = "text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500";

function Hrac({ playerId, jmeno }: { playerId: string; jmeno: string }) {
  return <Link href={`/dashboard/player/${playerId}`} className={ODKAZ_HRACE}>{jmeno}</Link>;
}

export function DetailIncidentu({ teamId, incidentId, onZmena }: { teamId: string; incidentId: string; onZmena: () => void }) {
  const [detail, setDetail] = useState<DetailIncidentuData | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<{ typ: "ok" | "chyba"; text: string } | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [obvinenyId, setObvinenyId] = useState("");
  const [potvrditVyhazov, setPotvrditVyhazov] = useState(false);

  const cesta = `/api/teams/${teamId}/incidents/${encodeURIComponent(incidentId)}`;

  const nacti = useCallback(() => {
    apiFetch<DetailIncidentuData>(cesta)
      .then((d) => { setDetail(d); setChyba(null); })
      .catch((e) => {
        console.error("incident detail fetch:", e);
        setChyba(e instanceof Error ? e.message : "Incident se nepodařilo načíst.");
      });
  }, [cesta]);

  useEffect(() => { nacti(); }, [nacti]);

  async function proved(akce: string, telo: Record<string, string> | null, hotovo: (odpoved: Record<string, unknown>) => string) {
    setPracuje(true);
    setZprava(null);
    try {
      const odpoved = await apiFetch<Record<string, unknown>>(`${cesta}/${akce}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo ?? {}),
      });
      setZprava({ typ: "ok", text: hotovo(odpoved) });
      setPotvrditVyhazov(false);
      setObvinenyId("");
      nacti();
      onZmena();
    } catch (e) {
      console.error(`incident ${akce}:`, e);
      setZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Akci se nepodařilo provést." });
    } finally {
      setPracuje(false);
    }
  }

  if (chyba) return <div className="card p-4 text-sm text-muted">{chyba}</div>;
  if (!detail) return <div className="flex justify-center py-10"><Spinner /></div>;

  const { incident: i, vysetrovani: v, akce } = detail;
  const vysledek = i.status === "uzavreny" && i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  const vysetruje = i.category === "kradez" || i.category === "poskozeni";
  const maAkce = akce.obvinit || akce.policie || akce.tresty.length > 0;
  const podezreli = v.podezreli.filter((p): p is { playerId: string; jmeno: string } => !!p.jmeno);
  // Pachatel je známý, ale trest se vybrat nedá, protože odešel z klubu. Bez týhle hlášky
  // incident vypadá jako "Řeší se" navždy, beze slova proč.
  const pachatelOdesel = i.status === "otevreny" && vysetruje && v.stav === "znamy" && akce.tresty.length === 0;

  function obvinit() {
    const jmeno = detail?.kadr.find((h) => h.playerId === obvinenyId)?.jmeno ?? "Hráč";
    void proved("obvinit", { playerId: obvinenyId }, (o) => `${jmeno}: ${OBVINENI_LABEL[o.vysledek as VysledekObvineni] ?? "hotovo"}.`);
  }

  function rozhodnout(a: AkceTrestu) {
    void proved("rozhodnuti", { akce: a }, () => TREST_HOTOVO[a]);
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading font-bold text-lg">{i.label}</h1>
            <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full ${STAV_TRIDA[i.status]}`}>{STAV_LABEL[i.status]}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · uzavře se ${datum(i.deadline)}`}
            {vysledek && ` · ${vysledek}`}
          </div>
        </div>
      </div>

      <p className="text-sm">{i.text}</p>
      {i.ztraty.length > 0 && (
        <ul className="space-y-1">
          {i.ztraty.map((z, n) => <li key={n} className="text-sm text-card-red">{z}</li>)}
        </ul>
      )}

      {vysetruje && (
        <div>
          <SectionLabel>Vyšetřování</SectionLabel>
          {v.stav === "znamy" && i.pachatel?.jmeno ? (
            <p className="text-sm">Pachatel: <Hrac playerId={i.pachatel.playerId} jmeno={i.pachatel.jmeno} /></p>
          ) : podezreli.length > 0 ? (
            <p className="text-sm">
              Podezřelí:{" "}
              {podezreli.map((p, n) => (
                <span key={p.playerId}>{n > 0 && ", "}<Hrac playerId={p.playerId} jmeno={p.jmeno} /></span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-muted">Kdo za tím stojí, zatím nikdo neví.</p>
          )}

          {detail.stopy.length > 0 && (
            <ul className="mt-3 space-y-2">
              {detail.stopy.map((s, n) => (
                <li key={n} className="flex gap-2 text-sm">
                  <span aria-hidden>{ZDROJ_EMOJI[s.zdroj] ?? "🔎"}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          )}

          {detail.obvineni.length > 0 && (
            <ul className="mt-3 space-y-1">
              {detail.obvineni.map((o, n) => (
                <li key={n} className="text-sm">
                  Obvinění {datum(o.den)}: <Hrac playerId={o.playerId} jmeno={o.jmeno} />, {OBVINENI_LABEL[o.vysledek]}.
                </li>
              ))}
            </ul>
          )}

          {i.status === "policie" && detail.policie.vysledekOn && (
            <p className="text-sm mt-3">🚓 Případ šetří policie. Výsledek do {datum(detail.policie.vysledekOn)}.</p>
          )}
        </div>
      )}

      {maAkce && (
        <div className="border-t border-gray-100 pt-4 space-y-5">
          {akce.obvinit && (
            <div className="space-y-2">
              <SectionLabel>Obvinit hráče</SectionLabel>
              <p className="text-sm text-muted">
                Zbývá obvinění: {detail.zbyvaObvineni}. Nevinného hráče obvinění hodně urazí a kabina to ponese špatně.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={obvinenyId}
                  onChange={(e) => setObvinenyId(e.target.value)}
                  className="flex-1 min-w-0 rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                >
                  <option value="">Vyber hráče</option>
                  {detail.kadr.map((h) => <option key={h.playerId} value={h.playerId}>{h.jmeno}</option>)}
                </select>
                <button
                  onClick={obvinit}
                  disabled={pracuje || !obvinenyId}
                  className="px-4 py-2 rounded-soft text-sm font-heading font-bold bg-card-red text-white disabled:opacity-50"
                >
                  Obvinit
                </button>
              </div>
            </div>
          )}

          {akce.policie && (
            <div className="space-y-2">
              <SectionLabel>Policie</SectionLabel>
              <p className="text-sm text-muted">
                Policie případ převezme a výsledek oznámí za 3 až 7 dní. Čím víc stop, tím větší šance, že pachatele najde. Zavolat ji jde jen jednou.
              </p>
              <button
                onClick={() => void proved("policie", null, (o) => `Policie případ převzala. Výsledek do ${datum(String(o.vysledekOn))}.`)}
                disabled={pracuje}
                className="w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold bg-blue-600 text-white disabled:opacity-50"
              >
                Zavolat policii
              </button>
            </div>
          )}

          {akce.tresty.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Co s pachatelem</SectionLabel>
              <ul className="text-sm text-muted space-y-1">
                {detail.castky && akce.tresty.includes("srazka") && (
                  <li>Srážka ze mzdy: celkem {kc(detail.castky.srazka)} během {detail.castky.tydnu} týdnů.</li>
                )}
                {detail.castky && akce.tresty.includes("pokuta") && <li>Pokuta: {kc(detail.castky.pokuta)} najednou.</li>}
                {akce.tresty.includes("policie") && <li>Předat policii: soud mu dá podmínku, v klubu zůstane.</li>}
                {akce.tresty.includes("vyhodit") && <li>Vyhodit: hráč odejde mezi volné hráče.</li>}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {akce.tresty.filter((a) => a !== "vyhodit").map((a) => (
                  <button
                    key={a}
                    onClick={() => rozhodnout(a)}
                    disabled={pracuje}
                    className="px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {TREST_LABEL[a]}
                  </button>
                ))}
              </div>
              {akce.tresty.includes("vyhodit") && (potvrditVyhazov ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => rozhodnout("vyhodit")}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold bg-card-red text-white disabled:opacity-50"
                  >
                    Ano, vyhodit
                  </button>
                  <button
                    onClick={() => setPotvrditVyhazov(false)}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200"
                  >
                    Zpět
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPotvrditVyhazov(true)}
                  disabled={pracuje}
                  className="w-full px-3 py-2 rounded-soft text-sm font-heading font-bold border border-red-200 text-card-red disabled:opacity-50"
                >
                  {TREST_LABEL.vyhodit}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pachatelOdesel && (
        <p className="text-sm text-muted">Pachatel už v klubu není. Incident se uzavře po lhůtě.</p>
      )}

      {zprava && (
        <p className={`text-sm ${zprava.typ === "ok" ? "text-pitch-600" : "text-card-red"}`}>{zprava.text}</p>
      )}
    </div>
  );
}
