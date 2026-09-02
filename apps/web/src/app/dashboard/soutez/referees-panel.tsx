"use client";

/**
 * Komise rozhodčích — obsazení nejbližšího kola, listina se známkami a tresty.
 *
 * Delegace běží automaticky; komisař má tři nástroje odstupňované podle tvrdosti:
 * výměnu sudího na konkrétním zápase, stopku na tři kola a vyškrtnutí na celou
 * sezónu. Výměna je pravomoc se zjevným střetem zájmů — vlastní zápas se
 * nezakazuje, ale je vidět, a strop výměn na kolo brání tomu, aby si komisař
 * rozdal celé kolo sám.
 */

import { useMemo, useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { EntityLink, Modal } from "@/components/ui";
import { Empty, OpenProposalNote, Ornament, czk, plural } from "./ui";
import type { DelegatedMatch, FreeReferee, RefereeData, RefereeRow, State } from "./types";

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
  const [swapTarget, setSwapTarget] = useState<DelegatedMatch | null>(null);
  if (!data) return <Empty>Načítám listinu rozhodčích…</Empty>;

  const flagged = data.referees.filter((r) => r.flagged);
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

      {data.round && data.delegation.length > 0 && (
        <div className="card p-5">
          <Ornament right={`${data.round.matches} ${plural(data.round.matches, "zápas", "zápasy", "zápasů")}`}>
            Obsazení {data.round.gameWeek}. kola
          </Ornament>
          <p className="text-sm text-muted">
            {muzeObsazovat
              ? `Delegace proběhla losem. Vyměnit můžeš ${data.maxSwaps} ${plural(data.maxSwaps, "rozhodčího", "rozhodčí", "rozhodčích")} za kolo — zatím jsi vyměnil ${data.swapsUsed}. Každá výměna je vidět i s tím, koho jsi odvolal.`
              : "Kdo píská nejbližší kolo. Delegace proběhla losem; do obsazení může zasáhnout komisař rozhodčích."}
          </p>

          <div className="divide-y mt-3" style={{ borderColor: "var(--color-line)" }}>
            {data.delegation.map((m) => (
              <MatchRow
                key={m.matchId} m={m} teamId={teamId}
                muzeMenit={!!muzeObsazovat && (data.swapsUsed < data.maxSwaps || m.swapped)}
                onSwap={() => setSwapTarget(m)}
              />
            ))}
          </div>

          {muzeObsazovat && data.swapsUsed >= data.maxSwaps && (
            <p className="text-sm mt-3" style={{ color: "#A32B1F" }}>
              Výměny máš pro tohle kolo vyčerpané ({data.swapsUsed} z {data.maxSwaps}).
              Opravit už provedenou výměnu ještě můžeš.
            </p>
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

      {banTarget && teamId && (
        <BanForm
          referee={banTarget} teamId={teamId} deposit={state.deposit} jeKomisar={jeKomisar}
          onClose={() => setBanTarget(null)}
          onSaved={() => { setBanTarget(null); onChanged(); }}
        />
      )}

      {swapTarget && teamId && (
        <SwapForm
          match={swapTarget} teamId={teamId} volni={data.freeReferees}
          gameWeek={data.round?.gameWeek ?? 0}
          onClose={() => setSwapTarget(null)}
          onSaved={() => { setSwapTarget(null); onChanged(); }}
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

/**
 * Jeden zápas kola. Klubová jména jsou odkazy, sudí pod nimi — na mobilu se to
 * čte shora dolů a nic se nescrolluje do strany.
 */
function MatchRow({ m, teamId, muzeMenit, onSwap }: {
  m: DelegatedMatch; teamId: string | null; muzeMenit: boolean; onSwap: () => void;
}) {
  const mujZapas = m.homeTeamId === teamId || m.awayTeamId === teamId;

  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold break-words">
            <EntityLink type="team" id={m.homeTeamId}>{m.homeTeamName}</EntityLink>
            <span className="text-muted"> – </span>
            <EntityLink type="team" id={m.awayTeamId}>{m.awayTeamName}</EntityLink>
            {mujZapas && <span className="text-sm text-muted"> · tvůj zápas</span>}
          </div>
          <div className="text-sm text-muted break-words">
            {m.refereeName ?? "zatím bez rozhodčího"}
            {m.swapped && (
              <span style={{ color: "#866D1E" }}> · vyměněno komisařem</span>
            )}
          </div>
          {m.swapReason && (
            <div className="text-sm text-muted break-words italic">„{m.swapReason}"</div>
          )}
        </div>
        <div className="text-lg font-heading tabular-nums shrink-0" style={{ color: gradeColor(m.avgGrade) }}>
          {m.avgGrade !== null ? m.avgGrade.toFixed(2) : "—"}
        </div>
      </div>

      {muzeMenit && (
        <button className="btn btn-md btn-secondary mt-2" onClick={onSwap}>
          {m.swapped ? "Změnit znovu" : "Vyměnit rozhodčího"}
        </button>
      )}
    </div>
  );
}

/**
 * Výměna sudího na zápase.
 *
 * Náhradníci jsou seřazení od nejlepší známky — opačně než listina se známkami,
 * kde je nahoře ten, koho má komise řešit. Kdo ještě nepískal, jde nakonec:
 * nasadit neznámého má být rozhodnutí, ne výchozí volba.
 */
function SwapForm({ match, teamId, volni, gameWeek, onClose, onSaved }: {
  match: DelegatedMatch; teamId: string; volni: FreeReferee[]; gameWeek: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [refereeId, setRefereeId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const serazeni = useMemo(() => [...volni].sort((a, b) => {
    if (a.avgGrade === null && b.avgGrade === null) return a.name.localeCompare(b.name, "cs");
    if (a.avgGrade === null) return 1;
    if (b.avgGrade === null) return -1;
    return a.avgGrade - b.avgGrade;
  }), [volni]);

  const mujZapas = match.homeTeamId === teamId || match.awayTeamId === teamId;
  const kratkyDuvod = note.trim().length < MIN_DUVOD;

  const submit = async () => {
    if (kratkyDuvod || !refereeId) return;
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/referee-swap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.matchId, refereeId, note }),
      }),
      "Rozhodčího se nepodařilo vyměnit",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Výměna rozhodčího" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">
          {match.homeTeamName} – {match.awayTeamName}
        </div>
        <p className="text-sm text-muted">
          {gameWeek}. kolo. Los určil {match.refereeName ?? "zatím nikoho"}. Koho nasadíš místo
          něj, uvidí celá soutěž i s tvým odůvodněním.
        </p>

        {mujZapas && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
            <div className="font-semibold">Tenhle zápas hraje tvůj klub.</div>
            Zakázané to není, ale v zápisu bude stát, že sis vyměnil sudího sám sobě.
            Kluby tě za to můžou odvolat.
          </div>
        )}

        <div>
          <label className="text-sm text-muted">Kdo bude pískat místo něj</label>
          {serazeni.length === 0 ? (
            <p className="text-sm mt-1" style={{ color: "#A32B1F" }}>
              Ten den nemá nikdo z listiny volno. Vyměnit se nedá — všichni už někde pískají.
            </p>
          ) : (
            <select className="select w-full mt-1" value={refereeId}
              onChange={(e) => setRefereeId(e.target.value)}>
              <option value="">— vyber rozhodčího —</option>
              {serazeni.map((r) => (
                <option key={r.refereeId} value={r.refereeId}>
                  {r.name}{r.avgGrade !== null ? ` · známka ${r.avgGrade.toFixed(2)}` : " · zatím bez známky"}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--color-paper)" }}>
          Odvolaný sudí si to zapamatuje — míň než u stopky, protože pískat bude dál,
          jen ne tenhle zápas.
        </div>

        <div>
          <label className="text-sm text-muted">
            Odůvodnění (povinné — přečte si ho celá soutěž)
          </label>
          <textarea className="input w-full mt-1" rows={3} maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Proč tenhle zápas přeobsazuješ?" />
          {kratkyDuvod && (
            <p className="text-sm text-red-700 mt-1">
              Napiš aspoň {MIN_DUVOD} znaků. Za rozhodnutím komisaře musí být důvod.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1"
            disabled={saving || kratkyDuvod || !refereeId} onClick={submit}>
            {saving ? "Odesílám…" : "Vyměnit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
