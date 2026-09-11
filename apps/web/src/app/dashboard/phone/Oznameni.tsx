"use client";

/**
 * Oznámení v telefonu — vzhled zamykací obrazovky iPhonu.
 *
 * Tabulka `notifications` se plnila od začátku, ale v aplikaci ji nikdo
 * neukazoval: kdo neměl zapnutý push, o výsledcích, událostech ani nabídkách
 * se nedozvěděl. Tohle je jejich jediné místo.
 *
 * Tmavé pozadí s velkými hodinami a bílé karty jsou schválně — telefon tím
 * vizuálně odliší „co se stalo" od „s kým si píšeš".
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export interface NotifikaceItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

/** Ikona podle druhu — hráč pozná téma dřív, než přečte titulek. */
const IKONY: Record<string, string> = {
  match_reminder: "\u{23F0}",
  match_result: "\u{26BD}",
  event: "\u{1F389}",
  challenge: "\u{1F91C}",
  transfer: "\u{1F91D}",
  season: "\u{1F3C6}",
  system: "\u{2699}",
};

function pred(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "teď";
  if (min < 60) return `před ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `před ${h} h`;
  const dny = Math.floor(h / 24);
  return dny === 1 ? "včera" : `před ${dny} dny`;
}

export function Oznameni({ teamId, onZavrit, onZmena }: {
  teamId: string;
  onZavrit: () => void;
  /** Ať si seznam zpráv může přepočítat odznak. */
  onZmena: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotifikaceItem[] | null>(null);
  const [cas, setCas] = useState("");

  useEffect(() => {
    const tik = () => setCas(new Date().toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }));
    tik();
    const i = setInterval(tik, 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    apiFetch<{ items: NotifikaceItem[] }>(`/api/teams/${teamId}/notifications?limit=30`)
      .then((d) => setItems(d.items ?? []))
      .catch((e) => { console.error("načtení oznámení:", e); setItems([]); });
  }, [teamId]);

  const odbavit = async (id?: string) => {
    // Optimisticky — čekání na server by u zaklepnutí karty působilo jako zásek.
    setItems((prev) => (prev ?? []).map((n) => (!id || n.id === id ? { ...n, read: true } : n)));
    try {
      await apiFetch(`/api/teams/${teamId}/notifications/read`, {
        method: "POST", body: JSON.stringify(id ? { id } : {}),
      });
      onZmena();
    } catch (e) {
      console.error("označení oznámení:", e);
    }
  };

  const otevrit = async (n: NotifikaceItem) => {
    await odbavit(n.id);
    if (n.actionUrl) router.push(n.actionUrl);
  };

  const neprectene = (items ?? []).filter((n) => !n.read);
  const prectene = (items ?? []).filter((n) => n.read);

  return (
    <div className="fixed inset-0 sm:absolute z-30 bg-pitch-900 flex flex-col">
      <div className="px-4 pt-5 pb-3 text-center shrink-0">
        <div className="text-white/60 text-xs">Oznámení</div>
        <div className="text-white font-heading font-bold text-4xl tabular-nums leading-tight">{cas}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {items === null ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-white/60 mt-10">Nic nového. Klid na vsi.</p>
        ) : (
          <>
            {neprectene.map((n) => <Karta key={n.id} n={n} onClick={() => otevrit(n)} />)}
            {prectene.length > 0 && (
              <div className="pt-3 pb-1 text-xs text-white/50 px-1">Dřívější</div>
            )}
            {prectene.map((n) => <Karta key={n.id} n={n} tlumene onClick={() => otevrit(n)} />)}
          </>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 flex gap-2">
        {neprectene.length > 0 && (
          <button
            onClick={() => odbavit()}
            className="flex-1 rounded-full bg-white/15 text-white py-2 text-sm font-heading font-bold"
          >
            Vymazat vše
          </button>
        )}
        <button
          onClick={onZavrit}
          className="flex-1 rounded-full bg-white text-ink py-2 text-sm font-heading font-bold"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}

function Karta({ n, onClick, tlumene }: { n: NotifikaceItem; onClick: () => void; tlumene?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl px-3 py-2.5 flex gap-2.5 ${
        tlumene ? "bg-white/70" : "bg-white shadow-sm"
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-pitch-50 flex items-center justify-center text-base shrink-0">
        {IKONY[n.type] ?? "\u{1F4E3}"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-heading font-bold truncate">{n.title}</span>
          <span className="text-xs text-muted shrink-0">{pred(n.createdAt)}</span>
        </div>
        <p className="text-xs text-ink-light leading-snug mt-0.5">{n.body}</p>
      </div>
    </button>
  );
}
