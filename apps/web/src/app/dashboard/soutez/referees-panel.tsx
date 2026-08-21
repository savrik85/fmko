"use client";

/**
 * Komise rozhodčích — listina se známkami a návrh na vyškrtnutí.
 *
 * Známka je objektivní (dává ji delegát, ne kluby), takže sudí, kterému se
 * soustavně nedaří, se na program dostane sám. Vyškrtnutí má cenu: listina se
 * nedoplňuje a kdo pak píská dvakrát v jednom dni, jde do zápasu utahaný.
 */

import { useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui";
import { Empty, OpenProposalNote, Ornament, czk } from "./ui";
import type { RefereeData, RefereeRow, State } from "./types";

function gradeColor(g: number | null): string {
  if (g === null) return "var(--color-muted)";
  if (g <= 2.0) return "#1E4A1E";
  if (g <= 3.0) return "#866D1E";
  if (g <= 4.0) return "#A88A2A";
  return "#A32B1F";
}

export function RefereesPanel({ data, state, teamId, myOpen, onChanged }: {
  data: RefereeData | null; state: State; teamId: string | null;
  myOpen: { title: string } | null; onChanged: () => void;
}) {
  const [banTarget, setBanTarget] = useState<RefereeRow | null>(null);
  if (!data) return <Empty>Načítám listinu rozhodčích…</Empty>;

  const flagged = data.referees.filter((r) => r.flagged);

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
            <div key={r.refereeId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-base font-semibold break-words">
                  {r.name}
                  {r.banned && <span className="text-sm text-danger"> · vyškrtnut</span>}
                  {r.flagged && !r.banned && (
                    <span className="text-sm" style={{ color: "#A32B1F" }}> · pod drobnohledem</span>
                  )}
                </div>
                <div className="text-sm text-muted">
                  {r.matches} {r.matches === 1 ? "zápas" : r.matches < 5 ? "zápasy" : "zápasů"} v sezóně
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-lg font-heading tabular-nums" style={{ color: gradeColor(r.avgGrade) }}>
                  {r.avgGrade !== null ? r.avgGrade.toFixed(2) : "—"}
                </div>
                {state.enabled && !r.banned && data.canBan && teamId && !myOpen && (
                  <button className="btn btn-md btn-secondary" onClick={() => setBanTarget(r)}>
                    Navrhnout vyškrtnutí
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {banTarget && teamId && (
        <BanForm
          referee={banTarget} teamId={teamId} deposit={state.deposit}
          onClose={() => setBanTarget(null)}
          onSaved={() => { setBanTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function BanForm({ referee, teamId, deposit, onClose, onSaved }: {
  referee: RefereeRow; teamId: string; deposit: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/referee-bans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refereeId: referee.refereeId, note }),
      }),
      "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Návrh na vyškrtnutí rozhodčího" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Navrhnout vyškrtnutí — {referee.name}</div>
        <p className="text-sm text-muted">
          Sám ho nevyškrtneš. Návrh půjde na nejbližší zasedání a rozhodnou o něm kluby.
        </p>

        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "var(--color-paper)" }}>
          <div>Odpískal {referee.matches} zápasů, průměrná známka{" "}
            <strong style={{ color: gradeColor(referee.avgGrade) }}>
              {referee.avgGrade !== null ? referee.avgGrade.toFixed(2) : "—"}
            </strong>
          </div>
          <div className="text-muted">
            Návrh potřebuje dvoutřetinovou většinu.
          </div>
        </div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Nebude to zadarmo.</div>
          Po sezóně se vrátí a bude si pamatovat, kdo hlasoval pro. Kolegové z okresní
          komise si zapamatují navrhovatele. A protože se listina nedoplňuje, začnou
          sudí pískat dva zápasy denně — unavení.
        </div>

        <div>
          <label className="text-sm text-muted">Odůvodnění (nepovinné)</label>
          <textarea className="input w-full mt-1" rows={3} maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Proč by ho měla soutěž vyškrtnout?" />
        </div>

        <p className="text-sm text-muted">Za podání se skládá kauce {czk(deposit)}.</p>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" disabled={saving} onClick={submit}>
            {saving ? "Odesílám…" : "Podat návrh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
