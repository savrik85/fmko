"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, ErrorBox } from "@/components/ui";

type LeagueRequest = { id: string; name: string; email: string; district: string; status: "pending" | "invited" | "activated"; district_status: string; is_founder: number; created_at: string; activation_expires_at: string | null };

export function LeagueRequests() {
  const [requests, setRequests] = useState<LeagueRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [invite, setInvite] = useState<{ id: string; text: string; expiresAt: string } | null>(null);
  async function reload() {
    setLoading(true); setError("");
    try { setRequests(await apiFetch<LeagueRequest[]>("/api/registration/admin/requests")); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  async function approve(request: LeagueRequest) {
    if (!confirmed[request.id] || busy) return;
    setBusy(request.id); setError("");
    try {
      const result = await apiFetch<{ activationToken: string; email: string; expiresAt: string }>(`/api/registration/admin/requests/${request.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataReady: true }),
      });
      const link = `${window.location.origin}/registrace/aktivace#token=${result.activationToken}`;
      setInvite({ id: request.id, expiresAt: result.expiresAt, text: `Ahoj ${request.name},\n\nokres ${request.district} je připravený. Aktivuj svůj účet a založ klub:\n${link}\n\n${request.is_founder ? "Jako zakladatel dostaneš po založení týmu první předsednický mandát. Potom pozvi kamarády do vaší ligy." : "Přidáváš se do okresu jako manažer. Pokud zakladatel ještě nemá klub, registrace týmů se otevře hned po jeho založení."}\n\nOdkaz platí 7 dní a lze ho použít jednou.\nTým Prales` });
      await reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  return <section className="card p-5 space-y-5 ph-no-capture" aria-labelledby="league-requests-title">
    <div className="flex items-center justify-between gap-4"><h2 id="league-requests-title" className="text-h2">Nové okresy a registrace</h2><Button variant="ghost" onClick={reload} disabled={loading || busy !== null}>Obnovit</Button></div>
    <p className="text-sm text-ink-light">Nejprve připrav místní data. Potvrzením odemkneš okres a vygeneruješ odkaz, který odešleš na uvedený e-mail. Automatické odesílání není zapojené. Opětovné vygenerování zneplatní předchozí odkaz.</p>
    <ErrorBox message={error} />
    {loading && <p role="status">Načítám žádosti…</p>}
    {!loading && !error && requests.length === 0 && <p>Zatím nepřišla žádná žádost.</p>}
    <div className="space-y-4">{requests.map(request => {
      const overdue = request.status === "pending" && Date.now() - Date.parse(request.created_at) > 86400000;
      return <article key={request.id} className="border border-line rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-h3">{request.district} · {request.name}</h3><span className={`text-sm ${overdue ? "text-card-red font-bold" : "text-ink-light"}`}>{request.status === "activated" ? "Účet aktivovaný" : request.status === "invited" ? "Odkaz vygenerovaný" : overdue ? "Čeká déle než 24 hodin" : "Čeká na přípravu"}</span></div>
        <p className="text-sm break-all">{request.email} · {request.is_founder ? "Zakladatel / první předseda" : "Připojení manažera"}</p><p className="text-sm text-muted">Přijato {new Date(request.created_at).toLocaleString("cs-CZ")}</p>
        {request.status !== "activated" && <><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed[request.id] ?? false} onChange={e => setConfirmed(values => ({ ...values, [request.id]: e.target.checked }))} />Potvrzuji, že obce, příjmení, sponzoři a další místní data tohoto okresu jsou připravené.</label><Button onClick={() => approve(request)} disabled={!confirmed[request.id] || busy !== null}>{busy === request.id ? "Připravuji odkaz…" : request.status === "invited" ? "Vygenerovat nový odkaz" : "Odemknout okres a připravit odkaz"}</Button></>}
        {invite?.id === request.id && <div className="bg-pitch-50 p-4 rounded space-y-2 ph-no-capture" data-ph-no-capture><p className="font-bold">Text pro ruční odeslání na {request.email}</p><label htmlFor={`invite-${request.id}`} className="text-sm">Odkaz je soukromý. Pošli ho jen tomuto zájemci.</label><textarea id={`invite-${request.id}`} className="input w-full text-sm font-mono" rows={10} value={invite.text} readOnly onFocus={e => e.target.select()} /><p className="text-sm">Platnost do {new Date(invite.expiresAt).toLocaleString("cs-CZ")}. Zpráva zatím nebyla odeslána.</p></div>}
      </article>;
    })}</div>
  </section>;
}
