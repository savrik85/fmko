"use client";

/**
 * Domů — konfigurovatelný dashboard.
 *
 * Stránka sama nic nekreslí: načte layout, zjistí z registry, jaká data jeho
 * widgety potřebují, a nechá je vykreslit. Výchozí layout odpovídá tomu, jak
 * Domů vypadala dřív, takže kdo needituje, nepozná rozdíl.
 */

import { useEffect, useMemo, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, useConfirm } from "@/components/ui";
import { getWidget } from "@/components/dashboard/widgets/registry";
import { DEFAULT_LAYOUT } from "@/components/dashboard/widgets/default-layout";
import { useDashboardData } from "@/components/dashboard/widgets/use-dashboard-data";
import { WidgetFrame } from "@/components/dashboard/widgets/widget-frame";
import { WidgetPicker } from "@/components/dashboard/widgets/widget-picker";
import type { DataKey, LayoutItem, WidgetDef, WidgetWidth } from "@/components/dashboard/widgets/types";

const COL_SPAN: Record<WidgetWidth, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

export default function DashboardPage() {
  const { teamId } = useTeam();
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // ── Layout ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    apiFetch<{ widgets: LayoutItem[] | null }>(`/api/teams/${teamId}/dashboard-layout`)
      .then((d) => { if (alive) setLayout(d.widgets ?? DEFAULT_LAYOUT); })
      .catch((e) => {
        console.error("dashboard: načtení layoutu selhalo:", e);
        if (alive) setLayout(DEFAULT_LAYOUT);
      });
    return () => { alive = false; };
  }, [teamId]);

  // V editaci se kreslí rozpracovaná verze, jinak uložená.
  const active = editing ? draft : (layout ?? []);

  // Jen widgety, které katalog zná — neznámé id z uloženého layoutu se přeskočí.
  const resolved = useMemo(
    () => active
      .map((item) => ({ item, def: getWidget(item.id) }))
      .filter((x): x is { item: LayoutItem; def: WidgetDef } => x.def !== undefined),
    [active],
  );

  const needed = useMemo(() => {
    const keys = new Set<DataKey>();
    resolved.forEach(({ def }) => def.needs.forEach((k) => keys.add(k)));
    return [...keys];
  }, [resolved]);

  const { data } = useDashboardData(teamId, needed);

  // ── Editace ───────────────────────────────────────────────────────────────
  const startEditing = () => { setDraft(layout ?? DEFAULT_LAYOUT); setEditing(true); };
  const cancelEditing = () => { setEditing(false); setPickerOpen(false); };

  const move = (index: number, dir: -1 | 1) => {
    setDraft((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const remove = (index: number) => setDraft((prev) => prev.filter((_, i) => i !== index));
  const setWidth = (index: number, w: WidgetWidth) =>
    setDraft((prev) => prev.map((it, i) => (i === index ? { ...it, w } : it)));
  const add = (id: string) => {
    const def = getWidget(id);
    if (!def) return;
    setDraft((prev) => [...prev, { id, w: def.defaultWidth }]);
    setPickerOpen(false);
  };

  const save = async () => {
    if (!teamId || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/teams/${teamId}/dashboard-layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: draft }),
      });
      setLayout(draft);
      setEditing(false);
    } catch (e) {
      console.error("dashboard: uložení layoutu selhalo:", e);
      showError("Uložení se nezdařilo", (e as Error)?.message ?? "Zkus to prosím znovu.");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!teamId) return;
    const ok = await confirm({
      title: "Obnovit výchozí dashboard?",
      description: "Tvoje sestavení widgetů se smaže a Domů se vrátí do původní podoby.",
      confirmLabel: "Obnovit výchozí",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/teams/${teamId}/dashboard-layout`, { method: "DELETE" });
      setLayout(DEFAULT_LAYOUT);
      setDraft(DEFAULT_LAYOUT);
      setEditing(false);
    } catch (e) {
      console.error("dashboard: obnovení výchozího layoutu selhalo:", e);
      showError("Obnovení se nezdařilo", "Zkus to prosím znovu.");
    }
  };

  if (!layout) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={resetToDefault}
              className="px-3 py-1.5 rounded-lg text-sm font-heading font-bold text-muted hover:bg-gray-100 transition-colors"
            >
              Obnovit výchozí
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="px-3 py-1.5 rounded-lg text-sm font-heading font-bold text-muted hover:bg-gray-100 transition-colors"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "Ukládám…" : "Hotovo"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="px-3 py-1.5 rounded-lg text-sm font-heading font-bold text-muted hover:bg-gray-100 transition-colors"
          >
            ⚙ Upravit dashboard
          </button>
        )}
      </div>

      {resolved.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-2">🧱</div>
          <div className="font-heading font-bold text-lg">Dashboard je prázdný</div>
          <p className="text-sm text-muted mt-1">
            Přidej si widgety a poskládej si Domů podle sebe.
          </p>
          <button
            type="button"
            onClick={() => { if (!editing) startEditing(); setPickerOpen(true); }}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
          >
            + Přidat widget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {resolved.map(({ item, def }, index) => {
            const Widget = def.Component;
            return (
              <div key={`${item.id}-${index}`} className={COL_SPAN[item.w] ?? COL_SPAN[1]}>
                <WidgetFrame
                  title={def.title}
                  icon={def.icon}
                  bare={def.bare}
                  editing={editing}
                  width={item.w}
                  isFirst={index === 0}
                  isLast={index === resolved.length - 1}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                  onRemove={() => remove(index)}
                  onWidth={(w) => setWidth(index, w)}
                >
                  <Widget data={data} teamId={teamId ?? ""} editing={editing} />
                </WidgetFrame>
              </div>
            );
          })}
        </div>
      )}

      {editing && resolved.length > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2.5 rounded-lg text-sm font-heading font-bold border-2 border-dashed border-pitch-300 text-pitch-600 hover:bg-pitch-50 transition-colors"
          >
            + Přidat widget
          </button>
        </div>
      )}

      <WidgetPicker
        isOpen={pickerOpen}
        usedIds={draft.map((d) => d.id)}
        onAdd={add}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
