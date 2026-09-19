"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import {
  datum, kc, OBVINENI_LABEL, stavPilulka, TREST_HOTOVO, TREST_LABEL, VYSLEDEK_LABEL, ZDROJ_EMOJI,
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
  const [kolVyrazeni, setKolVyrazeni] = useState("1");
  const [tazanyId, setTazanyId] = useState("");
  const router = useRouter();

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
  const hrozi = i.status === "hrozi";
  const jeSituace = i.category === "zivotni";
  const jePozitivni = i.category === "pozitivni";
  const pilulka = stavPilulka(i);
  // Hrozící čin ani řeči, ze kterých nic nebylo, se nevyšetřují. Pozitivní incident se
  // nevyšetřuje nikdy - vzniká rovnou uzavřený a bez pachatele (katalog.ts).
  const vysetruje = (i.category === "kradez" || i.category === "poskozeni") && !hrozi && i.resolution !== "nestalo_se";
  const maAkce = akce.obvinit || akce.policie || akce.zeptat || akce.promluvit || akce.zaloha || akce.tresty.length > 0;
  const podezreli = v.podezreli.filter((p): p is { playerId: string; jmeno: string } => !!p.jmeno);
  // Pachatel je známý, ale trest se vybrat nedá, protože odešel z klubu. Bez týhle hlášky
  // incident vypadá jako "Řeší se" navždy, beze slova proč.
  const pachatelOdesel = i.status === "otevreny" && vysetruje && v.stav === "znamy" && akce.tresty.length === 0;

  function obvinit() {
    const jmeno = detail?.kadr.find((h) => h.playerId === obvinenyId)?.jmeno ?? "Hráč";
    void proved("obvinit", { playerId: obvinenyId }, (o) => `${jmeno}: ${OBVINENI_LABEL[o.vysledek as VysledekObvineni] ?? "hotovo"}.`);
  }

  async function otevritRozhovor(akceApi: "zeptat" | "promluvit", telo: Record<string, string>) {
    setPracuje(true);
    setZprava(null);
    try {
      const o = await apiFetch<{ conversationId: string }>(`${cesta}/${akceApi}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo),
      });
      router.push(`/dashboard/phone/${o.conversationId}`);
    } catch (e) {
      console.error(`incident ${akceApi}:`, e);
      setZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Konverzaci se nepodařilo otevřít." });
      setPracuje(false);
    }
  }

  function rozhodnout(a: AkceTrestu, navic: Record<string, string> = {}) {
    void proved("rozhodnuti", { akce: a, ...navic }, () => TREST_HOTOVO[a]);
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading font-bold text-lg">{i.label}</h1>
            <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full ${pilulka.trida}`}>{pilulka.label}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · uzavře se ${datum(i.deadline)}`}
            {hrozi && i.deadline && ` · rozhodne se ${datum(i.deadline)}`}
            {i.status === "probiha" && akce.zaloha && i.deadline && ` · rozhodni o záloze do ${datum(i.deadline)}`}
            {vysledek && ` · ${vysledek}`}
          </div>
        </div>
      </div>

      <p className="text-sm">{i.text}</p>
      {i.ztraty.length > 0 && (
        <ul className="space-y-1">
          {i.ztraty.map((z, n) => (
            <li key={n} className={`text-sm ${jePozitivni ? "text-pitch-600" : "text-card-red"}`}>{z}</li>
          ))}
        </ul>
      )}

      {(hrozi || i.resolution === "nestalo_se") && (
        <div>
          <SectionLabel>Řeči z hospody</SectionLabel>
          {i.ohlasil?.jmeno
            ? <p className="text-sm">Ohlásil to: <Hrac playerId={i.ohlasil.playerId} jmeno={i.ohlasil.jmeno} /></p>
            : <p className="text-sm">Ohlásil to hospodský.</p>}
          {hrozi && (
            <p className="text-sm text-muted mt-1">
              {detail.hrozi?.promluvil
                ? "Už jsi s ním mluvil. Jestli to udělá, se ukáže po lhůtě."
                : "Jestli to opravdu udělá, se ukáže po lhůtě. Když si s ním promluvíš, šance výrazně klesne."}
            </p>
          )}
        </div>
      )}

      {(jeSituace || jePozitivni) && i.dotceny?.jmeno && (
        <div>
          <SectionLabel>Koho se to týká</SectionLabel>
          <p className="text-sm"><Hrac playerId={i.dotceny.playerId} jmeno={i.dotceny.jmeno} /></p>
          {jeSituace && i.status === "probiha" && i.endsOn && <p className="text-sm text-muted mt-1">Potrvá do {datum(i.endsOn)}.</p>}
          {jeSituace && detail.situace?.zaloha === "pujceno" && detail.situace.castka != null && (
            <p className="text-sm text-muted mt-1">Zálohu jsi půjčil: {kc(detail.situace.castka)}, splácí se čtyři pondělky ze mzdy.</p>
          )}
          {jeSituace && detail.situace?.zaloha === "odmitnuto" && <p className="text-sm text-muted mt-1">Zálohu jsi odmítl.</p>}
        </div>
      )}

      {vysetruje && (
        <div>
          <SectionLabel>Vyšetřování</SectionLabel>
          {v.stav === "znamy" && i.pachatel?.jmeno ? (
            <p className="text-sm">
              Pachatel:{" "}
              {i.pachatel.playerId
                ? <Hrac playerId={i.pachatel.playerId} jmeno={i.pachatel.jmeno} />
                : <span className="text-base font-heading font-bold">{i.pachatel.jmeno}</span>}
            </p>
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
            <p className="text-sm mt-3">🚓 Případ šetří policie. Výsledek do {datum(detail.policie.vysledekOn)}</p>
          )}
        </div>
      )}

      {maAkce && (
        <div className="border-t border-gray-100 pt-4 space-y-5">
          {akce.promluvit && (
            <div className="space-y-2">
              <SectionLabel>Promluvit si s ním</SectionLabel>
              <p className="text-sm text-muted">
                Napiš mu, ať nedělá hlouposti. Čím lepší má k tobě vztah, tím spíš poslechne. Odpověď stojí kredit jako každá SMS.
              </p>
              <button
                onClick={() => void otevritRozhovor("promluvit", {})}
                disabled={pracuje}
                className="w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
              >
                Promluvit si
              </button>
            </div>
          )}
          {akce.zeptat && (
            <div className="space-y-2">
              <SectionLabel>Zeptat se hráče</SectionLabel>
              <p className="text-sm text-muted">
                Napiš hráči, jestli něco neviděl. Co ví, řekne, jen když bude chtít, a kamarád pachatele ho spíš bude krýt. Odpověď stojí kredit jako každá SMS.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={tazanyId}
                  onChange={(e) => setTazanyId(e.target.value)}
                  aria-label="Koho se zeptat"
                  className="flex-1 min-w-0 rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                >
                  <option value="">Vyber hráče</option>
                  {detail.kadr.map((h) => <option key={h.playerId} value={h.playerId}>{h.jmeno}</option>)}
                </select>
                <button
                  onClick={() => void otevritRozhovor("zeptat", { playerId: tazanyId })}
                  disabled={pracuje || !tazanyId}
                  className="px-4 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
                >
                  Zeptat se
                </button>
              </div>
            </div>
          )}
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
                onClick={() => void proved("policie", null, (o) => `Policie případ převzala. Výsledek do ${datum(String(o.vysledekOn))}`)}
                disabled={pracuje}
                className="w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold bg-blue-600 text-white disabled:opacity-50"
              >
                Zavolat policii
              </button>
            </div>
          )}

          {akce.zaloha && (
            <div className="space-y-2">
              <SectionLabel>Záloha na mzdu</SectionLabel>
              <p className="text-sm text-muted">
                Půjčka 3 000 až 8 000 Kč podle toho, jak zle na tom je. Vrací se čtyřmi splátkami ze mzdy. Když nerozhodneš do lhůty, bere se to jako odmítnutí.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void proved("zaloha", { akce: "pujcit" }, () => "Záloha vyplacena.")}
                  disabled={pracuje}
                  className="px-3 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
                >
                  Půjčit zálohu
                </button>
                <button
                  onClick={() => void proved("zaloha", { akce: "odmitnout" }, () => "Zálohu jsi odmítl.")}
                  disabled={pracuje}
                  className="px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  Odmítnout
                </button>
              </div>
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
                {akce.tresty.includes("vyradit") && <li>Vyřadit: hráč vynechá příští 1 až 3 ligová kola, do té doby nenastoupí ani v poháru.</li>}
                {akce.tresty.includes("policie") && <li>Předat policii: soud mu dá podmínku, v klubu zůstane.</li>}
                {akce.tresty.includes("vyhodit") && <li>Vyhodit: hráč odejde mezi volné hráče.</li>}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {akce.tresty.filter((a) => a !== "vyhodit" && a !== "vyradit").map((a) => (
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
              {akce.tresty.includes("vyradit") && (
                <div className="flex gap-2">
                  <select
                    value={kolVyrazeni}
                    onChange={(e) => setKolVyrazeni(e.target.value)}
                    aria-label="Počet ligových kol"
                    className="rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                  >
                    <option value="1">1 kolo</option>
                    <option value="2">2 kola</option>
                    <option value="3">3 kola</option>
                  </select>
                  <button
                    onClick={() => rozhodnout("vyradit", { zapasu: kolVyrazeni })}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {TREST_LABEL.vyradit}
                  </button>
                </div>
              )}
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
