"use client";

/**
 * Disciplinární rada — návrh pokuty s důkazem a přehled uložených trestů.
 *
 * Formulář nenabídne skutek, který se u daného klubu nedá doložit. Jediná
 * výjimka je nesportovní chování, kde se místo důkazu píše odůvodnění.
 */

import React, { useMemo, useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { EntityLink, Modal } from "@/components/ui";
import { Empty, OpenProposalNote, Ornament, PersonLine, Portrait, Rozbaleni, StatusPill, czk, plural } from "./ui";
import type { DisciplineData, PitchRow, Sanction, State } from "./types";

export function DisciplinePanel({ data, state, teamId, isChair, myOpen, onChanged }: {
  data: DisciplineData | null; state: State; teamId: string | null;
  isChair: boolean; myOpen: { title: string } | null; onChanged: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  if (!data) return <Empty>Načítám disciplinární agendu…</Empty>;

  const mine = data.sanctions.filter((s) => s.teamId === teamId);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <Ornament>Co lze potrestat</Ornament>
        <div className="space-y-2">
          {data.offences.map((o) => (
            <div key={o.kind} className="text-sm">
              <span className="font-semibold">{o.label}</span>
              <span className="text-muted"> — {o.evidenceLabel}</span>
              {o.majority > 0.5 && <span className="text-muted"> · dvoutřetinová většina</span>}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted mt-3">
          Návrh jde podat jen na skutek, který se dá doložit z dat. Důkaz uvidí všichni
          hlasující. Jeden klub schytá nejvýš dvě pokuty za sezónu a o vlastní pokutě nehlasuje —
          místo toho má právo na obhajobu.
        </p>
      </div>

      {state.enabled && teamId && (
        myOpen ? <OpenProposalNote p={myOpen} /> : (
          <button className="btn btn-lg btn-primary w-full" onClick={() => setFormOpen(true)}>
            Podat návrh na pokutu
          </button>
        )
      )}

      {mine.length > 0 && (
        <div className="card p-5">
          <Ornament>Tresty tvého klubu</Ornament>
          <div className="space-y-3">
            {mine.map((s) => (
              <SanctionRow key={s.id} s={s} teamId={teamId} onChanged={onChanged} canAppeal />
            ))}
          </div>
        </div>
      )}

      <PitchOverview pitches={data.pitches} />

      <Rozbaleni
        title="Listina trestů"
        right={`${data.sanctions.length} celkem`}
        note={data.sanctions.length === 0
          ? "Zatím čistý štít — nikdo nedostal pokutu."
          : "Všechny pokuty sezóny i s odůvodněním."}
      >
        {data.sanctions.length > 0 && (
          <div className="space-y-3">
            {data.sanctions.map((s) => (
              <SanctionRow key={s.id} s={s} teamId={teamId} onChanged={onChanged} />
            ))}
          </div>
        )}
      </Rozbaleni>

      {formOpen && teamId && (
        <FineForm
          data={data} teamId={teamId} isChair={isChair}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function SanctionRow({ s, teamId, onChanged, canAppeal }: {
  s: Sanction; teamId: string | null; onChanged: () => void; canAppeal?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const appeal = async () => {
    if (!teamId) return;
    setBusy(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/sanctions/${s.id}/appeal`, { method: "POST" }),
      "Odvolání se nepodařilo podat",
    );
    setBusy(false);
    if (ok) onChanged();
  };

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--color-paper)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold break-words">
            {s.managerName ?? s.teamName} · {czk(s.amount)}
          </div>
          <div className="text-sm text-muted break-words">{s.reason}</div>
        </div>
        <StatusPill status={s.status} />
      </div>
      {s.evidence && <div className="text-sm mt-1 break-words">Doloženo: {s.evidence}</div>}
      <div className="text-xs text-muted mt-1">
        {s.issuedBy === "chair" ? "Uložil předseda disciplinární rady" : "Rozhodlo zasedání grémia"}
      </div>
      {canAppeal && s.status === "issued" && (
        <button className="btn btn-md btn-secondary w-full mt-2" disabled={busy} onClick={appeal}>
          Odvolat se
        </button>
      )}
    </div>
  );
}

function FineForm({ data, teamId, isChair, onClose, onSaved }: {
  data: DisciplineData; teamId: string; isChair: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  // Vlastní klub v seznamu nemá co dělat — pokutovat se sám nedá.
  const targets = useMemo(
    () => data.targets.filter((t) => t.teamId !== teamId), [data.targets, teamId]);

  const [target, setTarget] = useState(targets[0]?.teamId ?? "");
  const chosen = targets.find((t) => t.teamId === target);

  // Nabízí se jen doložitelné skutky plus volná položka.
  // V nabídce jsou VŠECHNY skutky, jen ty nedoložitelné nejdou vybrat. Dřív se
  // schovávaly a u klubu bez důkazu zbylo v seznamu jediné „nesportovní chování",
  // což vypadalo jako rozbitá stránka — ne jako pravidlo.
  const evidenced = useMemo(
    () => new Set((chosen?.evidence ?? []).map((e) => e.kind)), [chosen]);

  // Doložené napřed — volná položka je až poslední možnost, protože potřebuje
  // dvoutřetinovou většinu a navrhovatel u ní riskuje kauci.
  const options = useMemo(() => {
    const lze = data.offences.filter((o) => evidenced.has(o.kind));
    const volna = data.offences.filter((o) => o.freeText);
    const nelze = data.offences.filter((o) => !o.freeText && !evidenced.has(o.kind));
    return [...lze, ...volna, ...nelze];
  }, [evidenced, data.offences]);

  const lzeVybrat = (kind: string) =>
    evidenced.has(kind) || data.offences.find((o) => o.kind === kind)?.freeText === true;

  const nicNelzeDolozit = evidenced.size === 0;

  const [offence, setOffence] = useState(options[0]?.kind ?? "other");
  const [amount, setAmount] = useState(String(data.limits.min));
  const [note, setNote] = useState("");
  const [direct, setDirect] = useState(false);
  const [saving, setSaving] = useState(false);

  // Po přepnutí klubu se skutek překlopí na ten doložený. Bez toho by u klubu
  // s důkazem zůstala vybraná volná položka a hráč by si zbytečně přitížil.
  const lastTarget = React.useRef(target);
  React.useEffect(() => {
    const prvniMozny = options.find((o) => lzeVybrat(o.kind))?.kind ?? "other";
    if (lastTarget.current !== target) {
      lastTarget.current = target;
      setOffence(prvniMozny);
    } else if (!lzeVybrat(offence)) {
      setOffence(prvniMozny);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, options, offence]);

  const spec = data.offences.find((o) => o.kind === offence);
  const evidence = chosen?.evidence.find((e) => e.kind === offence);

  const submit = async () => {
    setSaving(true);
    const url = direct
      ? `/api/teams/${teamId}/competition/sanctions/direct`
      : `/api/teams/${teamId}/competition/sanctions`;
    const ok = await apiAction(
      apiFetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTeamId: target, offence, amount: Number(amount), note }),
      }),
      direct ? "Pokutu se nepodařilo uložit" : "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Návrh na pokutu" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Návrh na pokutu</div>

        <div>
          <label className="text-sm text-muted">Koho se to týká</label>
          <select className="select w-full mt-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.managerName ? `${t.managerName} (${t.teamName})` : t.teamName}
                {t.evidence.length > 0 ? ` — ${t.evidence.length}×` : ""}
              </option>
            ))}
          </select>
        </div>

        {chosen && (
          <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--color-paper)" }}>
            <Portrait avatar={chosen.managerAvatar} name={chosen.managerName ?? chosen.teamName} size={44} />
            <PersonLine managerName={chosen.managerName} teamId={chosen.teamId} teamName={chosen.teamName} />
          </div>
        )}

        <div>
          <label className="text-sm text-muted">Skutek</label>
          <select className="select w-full mt-1" value={offence} onChange={(e) => setOffence(e.target.value)}>
            {options.map((o) => (
              <option key={o.kind} value={o.kind} disabled={!lzeVybrat(o.kind)}>
                {o.label}{lzeVybrat(o.kind) ? "" : ` — u tohohle klubu nedoložíš (${o.evidenceLabel})`}
              </option>
            ))}
          </select>
          {nicNelzeDolozit && (
            <div className="text-sm text-muted mt-1">
              Tenhle klub nemá v datech nic, co by šlo doložit. Zbývá nesportovní chování —
              tam ale rozhoduje zasedání a při neúspěchu přijdeš o kauci.
            </div>
          )}
          {evidence
            ? <div className="text-sm mt-1">Doloženo: {evidence.detail}</div>
            : spec?.freeText
              ? <div className="text-sm text-muted mt-1">Bez důkazu — rozhodne zasedání, a proto je potřeba dvoutřetinová většina.</div>
              : null}
        </div>

        {spec?.freeText && (
          <div>
            <label className="text-sm text-muted">Co se stalo</label>
            <textarea className="input w-full mt-1" rows={3} maxLength={200}
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Popiš, co klub provedl. Bez toho návrh neprojde." />
          </div>
        )}

        <div>
          <label className="text-sm text-muted">
            Výše pokuty ({czk(data.limits.min)} – {czk(data.limits.max)})
          </label>
          <input className="input w-full mt-1 tabular-nums" type="number" step="500"
            min={data.limits.min} max={data.limits.max}
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        {isChair && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} className="mt-1" />
            <span>
              Uložit rovnou z titulu předsedy disciplinární rady (do {czk(data.limits.chairLimit)}).
              Bez hlasování — a klub se proti tomu může odvolat.
            </span>
          </label>
        )}

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" disabled={saving || !target} onClick={submit}>
            {saving ? "Odesílám…" : direct ? "Uložit pokutu" : "Podat návrh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Stav hřišť celé soutěže.
 *
 * Řadí od nejhoršího — koho má disciplinárka řešit, je nahoře. Když si soutěž
 * hranici neodhlasovala, je to jen přehled a nikdo nic neporušuje; říct to
 * rovnou je poctivější než ukazovat sloupec, který nic neznamená.
 */
function PitchOverview({ pitches }: { pitches: DisciplineData["pitches"] }) {
  const { limit, teams } = pitches;
  const pod = teams.filter((t) => t.breaches);

  const bezHriste = teams.filter((t) => t.pitch === null).length;

  const note = limit === 0
    ? "Soutěž si minimum neodhlasovala, takže se stav hřiště nepokutuje. Přehled zůstává."
    : pod.length === 0
      ? `Všichni jsou nad odhlasovanou hranicí ${limit} bodů.`
      : pod.length === 1
        ? `Jeden klub je pod odhlasovanou hranicí ${limit} bodů. Kontrola před zasedáním ho sebere sama.`
        : `${pod.length} ${plural(pod.length, "klub", "kluby", "klubů")} ${pod.length < 5 ? "jsou" : "je"} pod odhlasovanou hranicí ${limit} bodů. Kontrola před zasedáním je sebere sama.`;

  return (
    <Rozbaleni title="Stav hřišť" right={`${teams.length} ${plural(teams.length, "klub", "kluby", "klubů")}`} note={note}>
      <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
        {teams.map((t) => <PitchLine key={t.teamId} t={t} limit={limit} />)}
      </div>
      {/* Pomlčka místo čísla vypadá jako chyba dat, a přitom je to nepostavené
          hřiště. Kontrola takový klub taky přeskakuje — není co měřit. */}
      {bezHriste > 0 && (
        <p className="text-sm text-muted mt-3 leading-snug">
          {bezHriste === 1 ? "Jeden klub zatím nemá" : `${bezHriste} ${plural(bezHriste, "klub", "kluby", "klubů")} zatím ${bezHriste < 5 ? "nemají" : "nemá"}`} postavené
          hřiště. Bez trávníku není co měřit, takže se {bezHriste === 1 ? "nekontroluje" : "nekontrolují"}.
        </p>
      )}
    </Rozbaleni>
  );
}

/** Zelená nad hranicí, jantarová těsně nad ní, červená pod ní. */
function pitchColor(pitch: number | null, limit: number): string {
  if (pitch === null) return "var(--color-muted)";
  if (limit > 0 && pitch < limit) return "#A32B1F";
  if (limit > 0 && pitch < limit + 10) return "#A88A2A";
  if (pitch < 40) return "#A88A2A";
  return "#1E4A1E";
}

function PitchLine({ t, limit }: { t: PitchRow; limit: number }) {
  const barva = pitchColor(t.pitch, limit);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold break-words">
          <EntityLink type="team" id={t.teamId}>{t.teamName}</EntityLink>
          {t.breaches && <span className="text-sm" style={{ color: "#A32B1F" }}> · pod hranicí</span>}
        </div>
        {/* Pruh nese stav rychleji než číslo — na mobilu se čte jedním pohledem. */}
        <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--color-line)" }}>
          <div className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, t.pitch ?? 0))}%`, background: barva }} />
        </div>
      </div>
      <div className="text-lg font-heading tabular-nums shrink-0" style={{ color: barva }}>
        {t.pitch ?? "—"}
      </div>
    </div>
  );
}
