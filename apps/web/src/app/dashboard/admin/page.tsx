"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

interface SeedTable { key: string; label: string; count: number; editable: boolean; districts?: string[] }
interface SeedRow { [key: string]: unknown }

export default function AdminPage() {
  const { isAdmin, teamId } = useTeam();
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  if (!isAdmin) {
    return <div className="page-container"><div className="card p-8 text-center text-card-red font-heading font-bold text-xl">Přístup odepřen</div></div>;
  }

  const addLog = (msg: string) => setOutput((prev) => [...prev, `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  const advanceDay = async () => {
    setRunning(true);
    addLog("Spouštím denní tick (posunutí dne, tréninky, zprávy)...");
    try {
      const res = await fetch(`${API}/api/game/advance-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      addLog(`Denní tick hotov: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (e: any) { addLog(`CHYBA: ${e.message}`); }
    setRunning(false);
  };

  const runMatches = async () => {
    setRunning(true);
    addLog("Spouštím zápasový tick (18:00 simulace)...");
    try {
      const res = await fetch(`${API}/api/game/run-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      addLog(`Zápasový tick hotov: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (e: any) { addLog(`CHYBA: ${e.message}`); }
    setRunning(false);
  };

  const advanceWeek = async () => {
    setRunning(true);
    addLog("Spouštím 7 dní (denní tick + zápasový tick)...");
    for (let i = 0; i < 7; i++) {
      try {
        await fetch(`${API}/api/game/advance-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        await fetch(`${API}/api/game/run-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        addLog(`Den ${i + 1}/7 hotov`);
      } catch (e: any) { addLog(`CHYBA den ${i + 1}: ${e.message}`); break; }
    }
    addLog("Týden hotov");
    setRunning(false);
  };

  const wipePlayers = async () => {
    if (!confirm("Opravdu smazat všechna herní data?")) return;
    addLog("Toto vyžaduje přímý přístup k DB — použij CLI");
  };

  return (
    <div className="page-container space-y-5">
      <SectionLabel>Administrace</SectionLabel>

      {/* Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onClick={advanceDay} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⏭️</div>
          <div className="font-heading font-bold text-sm">+1 den</div>
          <div className="text-sm text-muted">Denní tick</div>
        </button>
        <button onClick={runMatches} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⚽</div>
          <div className="font-heading font-bold text-sm">Zápasy</div>
          <div className="text-sm text-muted">18:00 tick</div>
        </button>
        <button onClick={advanceWeek} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⏩</div>
          <div className="font-heading font-bold text-sm">+7 dní</div>
          <div className="text-sm text-muted">Denní + zápasy</div>
        </button>
        <button onClick={() => { addLog("Reloading..."); window.location.reload(); }}
          className="card p-4 text-center hover:bg-gray-50 transition-colors">
          <div className="text-2xl mb-1">🔄</div>
          <div className="font-heading font-bold text-sm">Refresh</div>
          <div className="text-sm text-muted">Reload stránky</div>
        </button>
        <button onClick={wipePlayers}
          className="card p-4 text-center hover:bg-red-50 transition-colors">
          <div className="text-2xl mb-1">🗑️</div>
          <div className="font-heading font-bold text-sm text-card-red">Wipe DB</div>
          <div className="text-sm text-muted">Smazat data</div>
        </button>
      </div>

      {/* Console output */}
      <div className="card p-4">
        <SectionLabel>Konzole</SectionLabel>
        <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg max-h-[400px] overflow-y-auto">
          {output.length === 0 ? (
            <div className="text-gray-500">Žádný výstup. Spusť akci výše.</div>
          ) : (
            output.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>

      {/* User Management */}
      <UserManagement />

      {/* Seed Data Management */}
      <SeedDataSection />

      {/* Info */}
      <div className="card p-4">
        <SectionLabel>Systém</SectionLabel>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">Team ID:</span> <span className="font-mono">{teamId ?? "—"}</span></div>
          <div><span className="text-muted">API:</span> <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL ?? "localhost:8787"}</span></div>
          <div><span className="text-muted">Env:</span> <span className="font-mono">{process.env.NODE_ENV}</span></div>
          <div><span className="text-muted">Admin:</span> <span className="font-mono text-pitch-500">true</span></div>
        </div>
      </div>
    </div>
  );
}

/* ── User Management ── */

function UserManagement() {
  const [users, setUsers] = useState<Array<{ id: string; email: string; is_admin: number; team_name: string | null }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [status, setStatus] = useState("");

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  const loadUsers = async () => {
    const data = await fetch(`${API}/auth/admin/users`, { credentials: "include" }).then((r) => r.json()).catch(() => []);
    setUsers(data);
    setLoaded(true);
  };

  useEffect(() => { loadUsers(); }, []);

  const resetPassword = async (userId: string) => {
    if (!newPw) return;
    const res = await fetch(`${API}/auth/admin/change-password`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ userId, newPassword: newPw }),
    }).then((r) => r.json()).catch(() => ({ error: "Chyba" }));
    setStatus(res.ok ? "Heslo změněno" : res.error);
    setNewPw("");
    setResetId(null);
    setTimeout(() => setStatus(""), 3000);
  };

  if (!loaded) return null;

  return (
    <div className="card p-4">
      <SectionLabel>Uživatelé ({users.length})</SectionLabel>
      {status && <div className="text-sm font-heading font-bold text-pitch-500 mb-2">{status}</div>}
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 px-3 text-[10px] font-heading font-bold text-muted uppercase">Email</th>
              <th className="py-2 px-3 text-[10px] font-heading font-bold text-muted uppercase">Tým</th>
              <th className="py-2 px-3 text-[10px] font-heading font-bold text-muted uppercase">Admin</th>
              <th className="py-2 px-3 text-[10px] font-heading font-bold text-muted uppercase">Heslo</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-1.5 px-3 font-mono text-xs">{u.email}</td>
                <td className="py-1.5 px-3">{u.team_name ?? "—"}</td>
                <td className="py-1.5 px-3">{u.is_admin ? "✓" : ""}</td>
                <td className="py-1.5 px-3">
                  {resetId === u.id ? (
                    <div className="flex gap-1 items-center">
                      <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Nové heslo" className="border border-gray-200 rounded px-2 py-0.5 text-xs w-32" />
                      <button onClick={() => resetPassword(u.id)} className="text-xs px-2 py-0.5 bg-pitch-500 text-white rounded font-bold">OK</button>
                      <button onClick={() => { setResetId(null); setNewPw(""); }} className="text-xs text-muted">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setResetId(u.id)} className="text-xs text-pitch-600 hover:underline">Změnit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Seed Data Section ── */

const TABLE_ICONS: Record<string, string> = {
  villages: "🏘️", district_surnames: "👤", district_sponsors: "💼",
  commentary_templates: "💬", crowd_reactions: "📣",
};

const COLUMN_LABELS: Record<string, Record<string, string>> = {
  district_surnames: { district: "Okres", surname: "Příjmení", frequency: "Frekvence" },
  district_sponsors: { district: "Okres", name: "Název", type: "Typ", monthly_min: "Min/měs", monthly_max: "Max/měs", win_bonus_min: "Bonus min", win_bonus_max: "Bonus max" },
  commentary_templates: { event_type: "Typ eventu", template: "Šablona", tags: "Tagy" },
  crowd_reactions: { text: "Text" },
  villages: { name: "Název", district: "Okres", region: "Kraj", population: "Obyvatel", size: "Velikost" },
  occupations: { name: "Povolání", hamlet: "Hamlet", village: "Village", town: "Town", small_city: "S.City", city: "City", injuryRisk: "Zranění", strengthBonus: "Síla", excuses: "Výmluvy" },
};

function SeedDataSection() {
  const [tables, setTables] = useState<SeedTable[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [rows, setRows] = useState<SeedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [district, setDistrict] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [editCell, setEditCell] = useState<{ rowIdx: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  useEffect(() => {
    fetch(`${API}/api/admin/seed-data`).then((r) => r.json()).then(setTables).catch(() => {});
  }, []);

  const loadTable = async (key: string, dist?: string) => {
    setActiveTable(key);
    setAdding(false);
    const q = dist ? `?district=${dist}` : "";
    const data = await fetch(`${API}/api/admin/seed-data/${key}${q}`).then((r) => r.json()).catch(() => ({ rows: [], total: 0 }));
    setRows(data.rows);
    setTotal(data.total);
  };

  const deleteRow = async (table: string, id: unknown) => {
    await fetch(`${API}/api/admin/seed-data/${table}/${id}`, { method: "DELETE" }).catch(() => {});
    loadTable(table, district || undefined);
  };

  const saveCell = async (rowIdx: number, col: string, value: string) => {
    if (!activeTable) return;
    const row = rows[rowIdx];
    const id = row.id ?? row.rowid;
    if (id == null) return;
    // Only save if value changed
    if (String(row[col] ?? "") === value) { setEditCell(null); return; }
    const numCols = ["frequency", "monthly_min", "monthly_max", "win_bonus_min", "win_bonus_max", "min_skill"];
    const body = { [col]: numCols.includes(col) ? Number(value) : value };
    await fetch(`${API}/api/admin/seed-data/${activeTable}/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setEditCell(null);
    loadTable(activeTable, district || undefined);
  };

  const addRow = async () => {
    if (!activeTable) return;
    const body: Record<string, string> = { ...newRow, district: district || newRow.district };
    if (newRow.frequency) body.frequency = String(Number(newRow.frequency));
    await fetch(`${API}/api/admin/seed-data/${activeTable}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setNewRow({});
    setAdding(false);
    loadTable(activeTable, district || undefined);
  };

  const activeInfo = tables.find((t) => t.key === activeTable);
  const cols = activeTable ? COLUMN_LABELS[activeTable] ?? {} : {};
  const colKeys = Object.keys(cols);

  return (
    <div className="card p-4">
      <SectionLabel>Seed data</SectionLabel>

      {/* Table cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {tables.map((t) => (
          <button key={t.key} onClick={() => { setDistrict(""); loadTable(t.key); }}
            className={`p-3 rounded-lg text-center transition-colors ${activeTable === t.key ? "bg-pitch-50 ring-1 ring-pitch-400" : "bg-gray-50 hover:bg-gray-100"}`}>
            <div className="text-lg">{TABLE_ICONS[t.key] ?? "📄"}</div>
            <div className="font-heading font-bold text-xs mt-1">{t.label}</div>
            <div className="text-xs text-muted tabular-nums">{t.count}</div>
          </button>
        ))}
      </div>

      {/* District filter */}
      {activeInfo?.districts && activeInfo.districts.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <button onClick={() => { setDistrict(""); loadTable(activeTable!); }}
            className={`text-xs px-2 py-1 rounded ${!district ? "bg-pitch-500 text-white" : "bg-gray-100"}`}>Vše</button>
          {activeInfo.districts.map((d) => (
            <button key={d} onClick={() => { setDistrict(d); loadTable(activeTable!, d); }}
              className={`text-xs px-2 py-1 rounded ${district === d ? "bg-pitch-500 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>{d}</button>
          ))}
        </div>
      )}

      {/* Data table */}
      {activeTable && colKeys.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">{total} záznamů</span>
            {activeInfo?.editable && (
              <button onClick={() => setAdding(!adding)}
                className="text-xs px-3 py-1 rounded-lg bg-pitch-500 text-white font-heading font-bold">
                {adding ? "Zrušit" : "+ Přidat"}
              </button>
            )}
          </div>

          {/* Add row form */}
          {adding && (
            <div className="flex gap-2 mb-3 flex-wrap items-end">
              {colKeys.filter((k) => k !== "district" || !district).map((k) => (
                <div key={k} className="flex-1 min-w-[120px]">
                  <label className="text-[10px] text-muted uppercase">{cols[k]}</label>
                  <input type="text" value={newRow[k] ?? ""} onChange={(e) => setNewRow({ ...newRow, [k]: e.target.value })}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" placeholder={cols[k]} />
                </div>
              ))}
              <button onClick={addRow} className="px-3 py-1 bg-pitch-500 text-white rounded text-sm font-bold shrink-0">Uložit</button>
            </div>
          )}

          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  {colKeys.map((k) => (
                    <th key={k} className="py-2 px-3 text-[10px] font-heading font-bold text-muted uppercase">{cols[k]}</th>
                  ))}
                  {activeInfo?.editable && <th className="py-2 px-3 w-10" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    {colKeys.map((k) => {
                      const isEditing = editCell?.rowIdx === i && editCell?.col === k;
                      const val = String(row[k] ?? "");
                      return (
                        <td key={k} className="py-1 px-2 text-sm max-w-[250px]">
                          {isEditing ? (
                            <input autoFocus type="text" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveCell(i, k, editValue)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveCell(i, k, editValue); if (e.key === "Escape") setEditCell(null); }}
                              className="w-full border border-pitch-400 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-pitch-400" />
                          ) : (
                            <span onClick={() => { if (activeInfo?.editable) { setEditCell({ rowIdx: i, col: k }); setEditValue(val); } }}
                              className={`block truncate ${activeInfo?.editable ? "cursor-pointer hover:bg-pitch-50 rounded px-1 -mx-1" : ""}`}
                              title={val.length > 40 ? val : undefined}>
                              {val.length > 60 ? val.slice(0, 60) + "..." : val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {activeInfo?.editable && (
                      <td className="py-1.5 px-2">
                        <button onClick={() => deleteRow(activeTable, row.id ?? row.rowid ?? i)}
                          className="text-card-red text-xs hover:underline">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
