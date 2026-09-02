"use client";

/**
 * Komise rozhodčích — listina se známkami, obsazovací listina kola a tresty.
 *
 * Komisař má tři nástroje odstupňované podle tvrdosti: obsazovací listinu (kdo
 * v kole vůbec píská), stopku na tři kola a vyškrtnutí na celou sezónu. Co
 * nedělá ani jeden z nich, je přiřazení sudího ke konkrétnímu zápasu — párování
 * losuje delegace, jinak by šlo poslat kartového cvoka na soupeře.
 */

import { useMemo, useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui";
import { Empty, GOLD_SOFT, OpenProposalNote, Ornament, czk, plural } from "./ui";
import type { RefereeData, RefereeRow, State } from "./types";

function gradeColor(g: number | null): string {
  if (g === null) return "var(--color-muted)";
  if (g <= 2.0) return "#1E4A1E";
  if (g <= 3.0) return "#866D1E";
  if (g <= 4.0) return "#A88A2A";
  return "#A32B1F";
}

export function RefereesPanel({ data, state, teamId, myOpen, jeKomisar, onChanged }: {
  data: RefereeData | null; state: State; teamId: string | null;
  myOpen: { title: string } | null; jeKomisar: boolean; onChanged: () => void;
}) {
  const [banTarget, setBanTarget] = useState<RefereeRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<RefereeRow | null>(null);
  const [obsazuje, setObsazuje] = useState(false);
  if (!data) return <Empty>Načítám listinu rozhodčích…</Empty>;

  const flagged = data.referees.filter((r) => r.flagged);
  const volni = data.referees.filter((r) => !r.banned && !r.paused);
  const muzeObsazovat = state.enabled && jeKomisar && teamId && data.round !== null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <Ornament right={`${data.usable} použitelných`}>Listina okresu</Ornament>
        <p className="text-sm text-muted">
          Listinu sdílí celý okres včetně U21. Vyškrtnutí platí jen pro tuhle soutěž a jen
          do konce sezóny — pak se sudí vrátí, a bude si pamatovat, kdo zvedl ruku.
          Vyškrtnout jich jde kolik chcete, dokud na listině zbyde aspoň {data.minList};
          nedoplňuje se, takže kdo pak píská dvakrát v jednom dni, jde do zápasu unavený.
        </p>
        {!data.canBan && data.banReason && (
          <div className="text-sm mt-2" style={{ color: "#A32B1F" }}>{data.banReason}</div>
        )}
      </div>

      {muzeObsazovat && data.round && (
        // Dokud listina není, je to úkol — proto se karta odliší barvou. Delegace
        // komisaře nepočká: proběhne dva herní dny před výkopem a kolo obsadí sama.
        <div className="card p-5" style={data.rosterSet ? undefined : { background: GOLD_SOFT }}>
          <Ornament right={`${data.round.matches} ${plural(data.round.matches, "zápas", "zápasy", "zápasů")}`}>
            Obsazovací listina {data.round.gameWeek}. kola
          </Ornament>
          <p className="text-sm text-muted">
            Vyber, kdo v tomhle kole píská. Kdo koho dostane, losuje delegace —
            nasadit sudího na konkrétní zápas nejde ani tobě. Vybrat musíš aspoň{" "}
            {data.round.matches}, tedy tolik, kolik je zápasů.
          </p>
          <p className="text-sm text-muted mt-2">
            {data.rosterSet
              ? "Listinu pro tohle kolo už máš sestavenou. Do delegace ji jde ještě změnit."
              : "Listinu jsi zatím nesestavil. Když ji necháš být, kolo se obsadí ze všech použitelných a tvoje slovo v tom nebude."}
          </p>
          {!obsazuje && (
            <button className="btn btn-md btn-secondary mt-3" onClick={() => setObsazuje(true)}>
              {data.rosterSet ? "Upravit obsazovací listinu" : "Sestavit obsazovací listinu"}
            </button>
          )}
        </div>
      )}

      {state.enabled && teamId && myOpen && <OpenProposalNote p={myOpen} />}

      {flagged.length > 0 && (
        <div className="card p-5" style={{ background: "#FBEAE8" }}>
          <Ornament>Na programu komise</Ornament>
          <p className="text-sm">
            {flagged.length === 1 ? "Tenhle sudí má" : "Tihle sudí mají"} po osmi a více zápasech
            průměrnou známku horší než 4,0. Komise se jimi má zabývat.
          </p>
          <div className="mt-2 space-y-1">
            {flagged.map((r) => (
              <div key={r.refereeId} className="text-sm font-semibold">{r.name}</div>
            ))}
          </div>
        </div>
      )}

      {obsazuje && data.round && teamId ? (
        <RosterForm
          referees={volni} matches={data.round.matches} gameWeek={data.round.gameWeek}
          teamId={teamId}
          onClose={() => setObsazuje(false)}
          onSaved={() => { setObsazuje(false); onChanged(); }}
        />
      ) : (
        <div className="card p-5">
          <Ornament>Rozhodčí a jejich známky</Ornament>
          <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
            {data.referees.map((r) => (
              <div key={r.refereeId} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold break-words">
                      {r.name}
                      {r.banned && <span className="text-sm text-danger"> · vyškrtnut</span>}
                      {r.paused && !r.banned && (
                        <span className="text-sm" style={{ color: "#A32B1F" }}>
                          {" "}· stopka do {r.pausedUntil}. kola
                        </span>
                      )}
                      {r.nominated && !r.banned && !r.paused && (
                        <span className="text-sm" style={{ color: "#1E4A1E" }}> · na listině kola</span>
                      )}
                      {r.flagged && !r.banned && !r.paused && (
                        <span className="text-sm" style={{ color: "#A32B1F" }}> · pod drobnohledem</span>
                      )}
                    </div>
                    <div className="text-sm text-muted">
                      {r.matches} {r.matches === 1 ? "zápas" : r.matches < 5 ? "zápasy" : "zápasů"} v sezóně
                    </div>
                  </div>
                  <div className="text-lg font-heading tabular-nums shrink-0" style={{ color: gradeColor(r.avgGrade) }}>
                    {r.avgGrade !== null ? r.avgGrade.toFixed(2) : "—"}
                  </div>
                </div>

                {/* Ovládání pod jméno, ne do řádku — na mobilu by se dvě tlačítka vedle známky nevešla. */}
                {state.enabled && teamId && !r.banned && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {jeKomisar && !r.paused && data.canPause && (
                      <button className="btn btn-md btn-secondary" onClick={() => setPauseTarget(r)}>
                        Stopka na {data.pauseWeeks} kola
                      </button>
                    )}
                    {/* Komisař rozhoduje sám, takže ho vlastní otevřený návrh nebrzdí. */}
                    {data.canBan && (!myOpen || jeKomisar) && (
                      <button className="btn btn-md btn-secondary" onClick={() => setBanTarget(r)}>
                        {jeKomisar ? "Vyškrtnout" : "Navrhnout vyškrtnutí"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {jeKomisar && !data.canPause && data.pauseReason && (
            <div className="text-sm mt-3" style={{ color: "#A32B1F" }}>{data.pauseReason}</div>
          )}
        </div>
      )}

      {banTarget && teamId && (
        <BanForm
          referee={banTarget} teamId={teamId} deposit={state.deposit} jeKomisar={jeKomisar}
          onClose={() => setBanTarget(null)}
          onSaved={() => { setBanTarget(null); onChanged(); }}
        />
      )}

      {pauseTarget && teamId && data.round && (
        <PauseForm
          referee={pauseTarget} teamId={teamId} weeks={data.pauseWeeks}
          fromWeek={data.round.gameWeek} maxPauses={data.maxPauses}
          onClose={() => setPauseTarget(null)}
          onSaved={() => { setPauseTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}

/**
 * Sestavení obsazovací listiny.
 *
 * Není to modal: na mobilu by se do něj čtyřiadvacet jmen s checkboxy nevešlo
 * a komisař potřebuje u výběru vidět známky.
 */
/**
 * Do výběru patří nejlepší nahoru — opačně než v listině se známkami, kde je
 * nahoře ten, koho má komise řešit. Známka je školní, takže „nejlepší" je
 * nejnižší číslo. Kdo ještě nepískal, jde nakonec: nemá se podle čeho seřadit
 * a nasadit neznámého je rozhodnutí, ne výchozí volba.
 */
function poradiProVyber(a: RefereeRow, b: RefereeRow): number {
  if (a.avgGrade === null && b.avgGrade === null) return a.name.localeCompare(b.name, "cs");
  if (a.avgGrade === null) return 1;
  if (b.avgGrade === null) return -1;
  return a.avgGrade - b.avgGrade;
}

function RosterForm({ referees, matches, gameWeek, teamId, onClose, onSaved }: {
  referees: RefereeRow[]; matches: number; gameWeek: number; teamId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [vybrani, setVybrani] = useState<Set<string>>(
    () => new Set(referees.filter((r) => r.nominated).map((r) => r.refereeId)),
  );
  const [saving, setSaving] = useState(false);

  // Seřadí se jednou, ne při každém zaškrtnutí — jinak by jména pod prstem poskakovala.
  const serazeni = useMemo(() => [...referees].sort(poradiProVyber), [referees]);

  const prepni = (id: string) => setVybrani((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const malo = vybrani.size > 0 && vybrani.size < matches;

  const submit = async () => {
    if (malo) return;
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/referee-roster`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refereeIds: [...vybrani] }),
      }),
      "Obsazovací listinu se nepodařilo uložit",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <div className="card p-5">
      <Ornament right={`${vybrani.size} z ${matches}`}>
        Kdo píská {gameWeek}. kolo
      </Ornament>
      <p className="text-sm text-muted">
        Zaškrtni aspoň {matches} rozhodčích. Prázdný výběr listinu zruší a kolo se
        obsadí ze všech.
      </p>

      <div className="divide-y mt-3" style={{ borderColor: "var(--color-line)" }}>
        {serazeni.map((r) => {
          const vybran = vybrani.has(r.refereeId);
          return (
            <label
              key={r.refereeId}
              className="flex items-center gap-3 py-2.5 cursor-pointer"
              style={vybran ? { background: "var(--color-paper)" } : undefined}
            >
              <input
                type="checkbox" checked={vybran} onChange={() => prepni(r.refereeId)}
                className="shrink-0 w-5 h-5"
              />
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold break-words">{r.name}</div>
                <div className="text-sm text-muted">
                  {r.matches} {r.matches === 1 ? "zápas" : r.matches < 5 ? "zápasy" : "zápasů"} v sezóně
                </div>
              </div>
              <div className="text-lg font-heading tabular-nums shrink-0" style={{ color: gradeColor(r.avgGrade) }}>
                {r.avgGrade !== null ? r.avgGrade.toFixed(2) : "—"}
              </div>
            </label>
          );
        })}
      </div>

      {malo && (
        <p className="text-sm mt-3" style={{ color: "#A32B1F" }}>
          V kole je {matches} zápasů, vybral jsi {vybrani.size}. Musí jich být aspoň tolik,
          kolik je zápasů.
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
        <button className="btn btn-lg btn-primary flex-1" disabled={saving || malo} onClick={submit}>
          {saving ? "Ukládám…" : "Uložit listinu"}
        </button>
      </div>
    </div>
  );
}

/** Server chce u přímého zásahu odůvodnění aspoň takhle dlouhé. */
const MIN_DUVOD = 10;

function PauseForm({ referee, teamId, weeks, fromWeek, maxPauses, onClose, onSaved }: {
  referee: RefereeRow; teamId: string; weeks: number; fromWeek: number; maxPauses: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const kratkyDuvod = note.trim().length < MIN_DUVOD;

  const submit = async () => {
    if (kratkyDuvod) return;
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/referee-pauses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refereeId: referee.refereeId, note }),
      }),
      "Stopku se nepodařilo uložit",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Stopka rozhodčímu" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Stopka na {weeks} kola — {referee.name}</div>
        <p className="text-sm text-muted">
          Rozhoduješ z titulu komisaře rozhodčích. Sudí vypadne z delegace na kola{" "}
          {fromWeek}–{fromWeek + weeks - 1} a pak se vrátí sám. V zápisu bude stát tvoje
          jméno i důvod.
        </p>

        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "var(--color-paper)" }}>
          <div>Odpískal {referee.matches} zápasů, průměrná známka{" "}
            <strong style={{ color: gradeColor(referee.avgGrade) }}>
              {referee.avgGrade !== null ? referee.avgGrade.toFixed(2) : "—"}
            </strong>
          </div>
          <div className="text-muted">Za sezónu můžeš rozdat {maxPauses} stopky.</div>
        </div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Zapamatuje si to.</div>
          Míň než u vyškrtnutí — po třech kolech je zpátky a bude pískat i tvoje zápasy.
          Listina se mezitím nedoplňuje, takže ostatní odpískají o něco víc.
        </div>

        <div>
          <label className="text-sm text-muted">
            Odůvodnění (povinné — přečte si ho celá soutěž)
          </label>
          <textarea className="input w-full mt-1" rows={3} maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Proč ho na tři kola odstavuješ?" />
          {kratkyDuvod && (
            <p className="text-sm text-red-700 mt-1">
              Napiš aspoň {MIN_DUVOD} znaků. Za rozhodnutím komisaře musí být důvod.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" disabled={saving || kratkyDuvod} onClick={submit}>
            {saving ? "Odesílám…" : "Dát stopku"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BanForm({ referee, teamId, deposit, jeKomisar, onClose, onSaved }: {
  referee: RefereeRow; teamId: string; deposit: number; jeKomisar: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  // Komisař škrtá rovnou; odškrtnutím se z toho stane běžný návrh na zasedání.
  const [primo, setPrimo] = useState(jeKomisar);
  const [saving, setSaving] = useState(false);

  const kratkyDuvod = primo && note.trim().length < MIN_DUVOD;

  const submit = async () => {
    if (kratkyDuvod) return;
    setSaving(true);
    const ok = await apiAction(
      apiFetch(
        primo
          ? `/api/teams/${teamId}/competition/referee-bans/direct`
          : `/api/teams/${teamId}/competition/referee-bans`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refereeId: referee.refereeId, note }),
        },
      ),
      primo ? "Rozhodčího se nepodařilo vyškrtnout" : "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Vyškrtnutí rozhodčího" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">
          {primo ? "Vyškrtnout" : "Navrhnout vyškrtnutí"} — {referee.name}
        </div>
        <p className="text-sm text-muted">
          {primo
            ? "Rozhoduješ z titulu komisaře rozhodčích. Platí to okamžitě, bez hlasování — a v zápisu bude stát tvoje jméno i důvod."
            : "Sám ho nevyškrtneš. Návrh půjde na nejbližší zasedání a rozhodnou o něm kluby."}
        </p>

        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "var(--color-paper)" }}>
          <div>Odpískal {referee.matches} zápasů, průměrná známka{" "}
            <strong style={{ color: gradeColor(referee.avgGrade) }}>
              {referee.avgGrade !== null ? referee.avgGrade.toFixed(2) : "—"}
            </strong>
          </div>
          <div className="text-muted">
            {primo ? "Rozhodnutí komisaře nepotřebuje hlasování." : "Návrh potřebuje dvoutřetinovou většinu."}
          </div>
        </div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Nebude to zadarmo.</div>
          Po sezóně se vrátí a bude si pamatovat, kdo hlasoval pro. Kolegové z okresní
          komise si zapamatují navrhovatele. A protože se listina nedoplňuje, začnou
          sudí pískat dva zápasy denně — unavení.
        </div>

        <div>
          <label className="text-sm text-muted">
            Odůvodnění {primo ? "(povinné — přečte si ho celá soutěž)" : "(nepovinné)"}
          </label>
          <textarea className="input w-full mt-1" rows={3} maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Proč ho na listině dál nechceš?" />
          {kratkyDuvod && (
            <p className="text-sm text-red-700 mt-1">
              Napiš aspoň {MIN_DUVOD} znaků. Za rozhodnutím komisaře musí být důvod.
            </p>
          )}
        </div>

        {jeKomisar && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={primo} onChange={(e) => setPrimo(e.target.checked)} className="mt-1" />
            <span>
              Vyškrtnout rovnou z titulu komisaře rozhodčích. Bez hlasování a bez kauce —
              odpovědnost je tvoje a kluby tě za ni můžou odvolat.
            </span>
          </label>
        )}

        {!primo && <p className="text-sm text-muted">Za podání se skládá kauce {czk(deposit)}.</p>}

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" disabled={saving || kratkyDuvod} onClick={submit}>
            {saving ? "Odesílám…" : primo ? "Vyškrtnout" : "Podat návrh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
