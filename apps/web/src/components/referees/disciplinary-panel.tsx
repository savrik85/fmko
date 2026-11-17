"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner, EntityLink, ListCard, ListRow, RowValue, StatusChip } from "@/components/ui";
import { formatKc } from "@/lib/format";

interface Fine {
  id: string;
  teamId: string;
  teamName: string;
  kind: "rozhovor" | "svaz";
  amount: number;
  reason: string;
  gameDate: string;
  createdAt: string;
}

/**
 * Stupně vítězů černé listiny. Barva jde inline, ne přes Tailwind třídu —
 * zlatá/stříbrná/bronzová nejsou tokeny palety, takže by se utility nevygenerovala.
 */
const MEDAILE = [
  { emoji: "\u{1F947}", barva: "#C4A035" },
  { emoji: "\u{1F948}", barva: "#B5AFA5" },
  { emoji: "\u{1F949}", barva: "#A87A12" },
];

/** České skloňování — „1 pokuta", „3 pokuty", „5 pokut". */
function pocetPokut(n: number): string {
  if (n === 1) return "pokuta";
  return n < 5 ? "pokuty" : "pokut";
}

/** Herní datum bez času — pokuta se váže ke dni, ne k minutě zaúčtování. */
function denPokuty(gameDate: string): string {
  const d = new Date(gameDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}

/** Řádky pokut do karty se seznamem. Odůvodnění je celá věta, proto pod název a nikdy useknuté. */
function FineRows({ fines }: { fines: Fine[] }) {
  return (
    <>
      {fines.map((f) => (
        <ListRow key={f.id}
          /* Pruh podle původu: komise červeně, svazová administrativa bez pruhu
             (dřív šedý). Na první pohled je vidět, co je trest za výroky a co papíry. */
          tone={f.kind === "rozhovor" ? "danger" : undefined}
          title={<EntityLink type="team" id={f.teamId}>{f.teamName}</EntityLink>}
          meta={<>
            <StatusChip tone={f.kind === "rozhovor" ? "danger" : "neutral"}>
              {f.kind === "rozhovor" ? "komise" : "svaz"}
            </StatusChip>{" "}
            {denPokuty(f.gameDate)}
          </>}
          detail={f.reason}
          trailing={<RowValue tone="minus">−{formatKc(f.amount)}</RowValue>} />
      ))}
    </>
  );
}

/** Listina pokut okresu — obsah záložky Disciplinárka na stránce Rozhodčí. */
export function DisciplinaryPanel({ teamId }: { teamId: string | null }) {
  const [fines, setFines] = useState<Fine[]>([]);
  const [district, setDistrict] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ district: string; fines: Fine[]; total: number }>(`/api/teams/${teamId}/disciplinary`)
      .then((d) => { setDistrict(d.district); setFines(d.fines ?? []); setTotal(d.total ?? 0); })
      .catch((e) => console.error("fetch disciplinary:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;

  // Kolik zaplatil který klub — trestní rejstřík okresu je zajímavější než samotný seznam.
  const podleTymu = Object.values(
    fines.reduce<Record<string, { teamId: string; teamName: string; count: number; sum: number }>>((acc, f) => {
      const zaznam = acc[f.teamId] ?? { teamId: f.teamId, teamName: f.teamName, count: 0, sum: 0 };
      zaznam.count += 1;
      zaznam.sum += f.amount;
      acc[f.teamId] = zaznam;
      return acc;
    }, {}),
  ).sort((a, b) => b.sum - a.sum);

  // Dvě různé věci pod jednou střechou: komise trestá výroky o rozhodčím,
  // svaz administrativu kolem zápasu. Míchat je do jednoho seznamu mátlo.
  const zaVyroky = fines.filter((f) => f.kind === "rozhovor");
  const odSvazu = fines.filter((f) => f.kind === "svaz");

  if (fines.length === 0) {
    return (
      <div className="card p-4">
        <p className="text-sm">
          Zatím žádná pokuta. Komise se ozve, až někdo v novinách přestřelí s kritikou sudího.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted mb-4">
        Pokuty udělené klubům okresu {district || "-"}. Komise trestá výroky o rozhodčích
        v okresním zpravodaji, svaz pak administrativní prohřešky kolem zápasu.
      </p>

      <div className="card p-3 mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted">Uloženo celkem</div>
          <div className="font-heading font-bold text-lg tabular-nums">
            {formatKc(total)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">Případů</div>
          <div className="font-heading font-bold text-lg tabular-nums">{fines.length}</div>
        </div>
      </div>

      <ListCard title="Černá listina okresu" className="mb-6">
        {podleTymu.map((t, i) => (
          <ListRow key={t.teamId} href={`/tym/${t.teamId}`} chevron={false}
            leading={i < 3
              ? <span className="text-xl" aria-hidden="true">{MEDAILE[i].emoji}</span>
              : <span className="text-body font-bold text-muted tabular-nums">{i + 1}</span>}
            title={t.teamName}
            meta={`${t.count}× ${pocetPokut(t.count)}`}
            trailing={<RowValue tone="minus">−{formatKc(t.sum)}</RowValue>} />
        ))}
      </ListCard>

      {zaVyroky.length > 0 && (
        <ListCard title="Za výroky o rozhodčím" className="mb-6">
          <FineRows fines={zaVyroky} />
        </ListCard>
      )}

      {odSvazu.length > 0 && (
        <ListCard title="Administrativa, pokuty od svazu">
          <p className="px-4 pt-3 text-meta text-muted">
            Pozdní soupiska, neuklizené kabiny, nedodaný zápis. S rozhodčími nemají nic společného.
          </p>
          <FineRows fines={odSvazu} />
        </ListCard>
      )}
    </>
  );
}
