"use client";

/**
 * Revize účetnictví klubů — třetí část agendy komisaře pro integritu.
 *
 * Komisař (nebo prezident soutěže) nahlédne do peněz kteréhokoli klubu soutěže
 * za posledních 60 dní. Příznaky nejsou obvinění, jen zvýraznění toho, co se
 * vymyká zbytku soutěže. Klub se o první revizi v sezóně dozví SMS.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { EntityLink, Modal } from "@/components/ui";
import { TXN_ICONS, TXN_LABELS } from "@/lib/transaction-labels";
import { Rozbaleni, czk, formatDate, plural } from "./ui";

interface AuditTarget { teamId: string; name: string; auditedAt: string | null }

interface LedgerCategory { type: string; income: number; expense: number; count: number }
interface LedgerItem { type: string; amount: number; description: string; gameDate: string | null }

interface ClubAudit {
  teamId: string;
  teamName: string;
  budget: number;
  since: string;
  windowDays: number;
  income: number;
  expense: number;
  categories: LedgerCategory[];
  largest: LedgerItem[];
  items: LedgerItem[];
  flags: string[];
}

const RED = "#A32B1F";

function amountStyle(n: number): React.CSSProperties {
  return { color: n < 0 ? RED : "var(--color-pitch-700, #1E4A1E)" };
}

function signedCzk(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${czk(Math.abs(n))}`;
}

function ItemRow({ item }: { item: LedgerItem }) {
  return (
    <li className="py-2 flex items-baseline gap-2">
      <span className="text-sm shrink-0" aria-hidden="true">{TXN_ICONS[item.type] ?? "📋"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{item.description || TXN_LABELS[item.type] || item.type}</div>
        <div className="text-micro text-muted">
          {TXN_LABELS[item.type] ?? item.type}
          {item.gameDate && ` · ${formatDate(item.gameDate)}`}
        </div>
      </div>
      <span className="text-sm font-heading font-bold tabular-nums shrink-0" style={amountStyle(item.amount)}>
        {signedCzk(item.amount)}
      </span>
    </li>
  );
}

export function ClubAuditSection({ teamId }: { teamId: string }) {
  const [targets, setTargets] = useState<AuditTarget[] | null>(null);
  const [windowDays, setWindowDays] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<ClubAudit | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const loadTargets = () => {
    apiFetch<{ windowDays: number; clubs: AuditTarget[] }>(`/api/teams/${teamId}/integrity/audits`)
      .then((d) => { setTargets(d.clubs); setWindowDays(d.windowDays); })
      .catch((e) => {
        console.error("načtení klubů k revizi:", e);
        setError(e instanceof Error ? e.message : "Seznam klubů se nepodařilo načíst.");
      });
  };

  useEffect(loadTargets, [teamId]);

  const openAudit = async (target: AuditTarget) => {
    setLoadingId(target.teamId);
    setError(null);
    try {
      const data = await apiFetch<ClubAudit>(`/api/teams/${teamId}/integrity/audits/${target.teamId}`, { method: "POST" });
      setAudit(data);
      if (!target.auditedAt) loadTargets();
    } catch (e) {
      console.error("revize účetnictví:", e);
      setError(e instanceof Error ? e.message : "Účetnictví se nepodařilo načíst.");
    } finally {
      setLoadingId(null);
    }
  };

  const audited = targets?.filter((t) => t.auditedAt).length ?? 0;

  return (
    <>
      <Rozbaleni
        title="Účetnictví klubů"
        right={targets ? `${targets.length} ${plural(targets.length, "klub", "kluby", "klubů")}` : undefined}
        note={
          <>
            Příjmy a výdaje klubu za posledních {windowDays} dní a to, co se vymyká zbytku soutěže.
            Klub se o první revizi v sezóně dozví zprávou.
            {audited > 0 && ` Letos revidováno: ${audited}.`}
          </>
        }
      >
        {error && <p className="text-sm leading-snug mb-2" style={{ color: RED }}>{error}</p>}
        {!targets && !error && <p className="text-sm text-muted">Načítám kluby…</p>}
        {targets && targets.length === 0 && (
          <p className="text-sm text-muted">V soutěži není žádný další klub s trenérem.</p>
        )}
        {targets && targets.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {targets.map((t) => (
              <li key={t.teamId} className="py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <EntityLink type="team" id={t.teamId} className="text-base font-semibold truncate block">
                    {t.name}
                  </EntityLink>
                  <div className="text-sm text-muted">
                    {t.auditedAt ? `Revidováno ${formatDate(t.auditedAt)}` : "Letos bez revize"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openAudit(t)}
                  disabled={loadingId !== null}
                  className="shrink-0 min-h-10 px-4 rounded-soft border border-gray-200 bg-white font-heading font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  {loadingId === t.teamId ? "Načítám…" : t.auditedAt ? "Otevřít" : "Nahlédnout"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Rozbaleni>

      <Modal isOpen={!!audit} onClose={() => setAudit(null)} title="Účetnictví klubu" maxWidth="640px">
        {audit && (
          <div className="p-4 space-y-4">
            <div>
              <EntityLink type="team" id={audit.teamId} className="text-base font-semibold">
                {audit.teamName}
              </EntityLink>
              <div className="text-sm text-muted">
                Za posledních {audit.windowDays} dní, od {formatDate(audit.since)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-soft bg-gray-50 p-2">
                <div className="text-micro text-muted uppercase tracking-wide">Na účtu</div>
                <div className="text-sm font-heading font-bold tabular-nums">{czk(audit.budget)}</div>
              </div>
              <div className="rounded-soft bg-gray-50 p-2">
                <div className="text-micro text-muted uppercase tracking-wide">Příjmy</div>
                <div className="text-sm font-heading font-bold tabular-nums" style={amountStyle(1)}>{czk(audit.income)}</div>
              </div>
              <div className="rounded-soft bg-gray-50 p-2">
                <div className="text-micro text-muted uppercase tracking-wide">Výdaje</div>
                <div className="text-sm font-heading font-bold tabular-nums" style={amountStyle(-1)}>{czk(audit.expense)}</div>
              </div>
            </div>

            <div>
              <div className="section-label mb-1">Co stojí za pohled</div>
              {audit.flags.length === 0 ? (
                <p className="text-sm text-muted">Nic se nevymyká zbytku soutěže.</p>
              ) : (
                <>
                  {audit.flags.map((f, i) => (
                    <div key={i} className="text-sm leading-snug mt-1" style={{ color: RED }}>⚠ {f}</div>
                  ))}
                  <p className="text-sm text-muted leading-snug mt-2">
                    Není to obvinění. Když usoudíš, že klub podvádí, navrhni pokutu přes disciplinárku.
                  </p>
                </>
              )}
            </div>

            {audit.categories.length > 0 && (
              <div>
                <div className="section-label mb-1">Podle druhu</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-micro text-muted uppercase tracking-wide">
                      <th className="text-left font-normal py-1">Druh</th>
                      <th className="text-right font-normal py-1">Příjmy</th>
                      <th className="text-right font-normal py-1">Výdaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {audit.categories.map((c) => (
                      <tr key={c.type}>
                        <td className="py-1.5 pr-2">{TXN_LABELS[c.type] ?? c.type}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.income > 0 ? czk(c.income) : ""}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.expense > 0 ? czk(c.expense) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {audit.largest.length > 0 && (
              <div>
                <div className="section-label mb-1">Největší položky</div>
                <ul className="divide-y divide-gray-50">
                  {audit.largest.map((item, i) => <ItemRow key={i} item={item} />)}
                </ul>
              </div>
            )}

            {audit.items.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Všechny položky ({audit.items.length})
                </summary>
                <ul className="divide-y divide-gray-50 mt-1">
                  {audit.items.map((item, i) => <ItemRow key={i} item={item} />)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
