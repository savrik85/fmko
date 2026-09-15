"use client";

/**
 * Zeď fanoušků v telefonu, tedy sociální síť okresního fotbalu.
 *
 * Jmenovala se „Tribuna", což nikomu neřeklo, o co jde. Navenek jsou to
 * „Socky"; soubor i komponenta zůstávají, přejmenovat je by bylo jen míchání
 * bez užitku.
 *
 * Nálada party byla dosud číslo na stránce fanoušků. „Kotel má náladu 34"
 * si nikdo nepředstaví; „zase to samý, doma s posledním a bez šance" ano.
 * Tohle je místo, kde se ta čísla dají číst jako lidi.
 *
 * Příspěvky nevznikají z ničeho: každý má za sebou událost, výtržnost, výsledek
 * zápasu, změnu oblíbence nebo kampaň. Vůdci part tu píšou pod svým jménem a
 * s vlastním obličejem, aby bylo poznat, že je to ta samá osoba, co posílá SMS.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { apiFetch } from "@/lib/api";

export interface Prispevek {
  id: string;
  author: string;
  handle: string;
  authorKind: "vudce" | "fanousek" | "novinar" | "rival" | "klub";
  avatar: Record<string, unknown> | null;
  body: string;
  tone: "pozitivni" | "negativni" | "neutralni";
  likes: number;
  topic: string;
  gameDate: string;
  createdAt: string;
}

const TEMA_IKONA: Record<string, string> = {
  club_event: "\u{1F4E2}",
  incident: "\u{1F6A8}",
  zapas: "\u{26BD}",
  oblibenec: "\u{2764}\u{FE0F}",
  rivalita: "\u{1F525}",
};

/** Filtry — kdo chce vidět jen průšvihy, ať je nemusí hledat mezi výsledky. */
const FILTRY = [
  { key: "vse", label: "Vše" },
  { key: "zapas", label: "Zápasy" },
  { key: "incident", label: "Průšvihy" },
  { key: "club_event", label: "Dění" },
] as const;

function pred(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "teď";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const dny = Math.floor(h / 24);
  return `${dny} d`;
}

/** Barevný proužek u příspěvku — nálada se má poznat dřív, než to člověk přečte. */
function pruh(tone: Prispevek["tone"]): string {
  if (tone === "pozitivni") return "border-l-pitch-500";
  if (tone === "negativni") return "border-l-card-red";
  return "border-l-gray-200";
}

function Avatar({ p }: { p: Prispevek }) {
  if (p.avatar) {
    return (
      <div className="w-[38px] h-[38px] rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
        <FaceAvatar faceConfig={p.avatar} size={32} />
      </div>
    );
  }
  const pismena = p.author.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-[38px] h-[38px] rounded-full bg-gray-200 text-ink-light flex items-center justify-center text-sm font-heading font-bold shrink-0">
      {pismena || "?"}
    </div>
  );
}

export function Tribuna({ teamId, onZavrit }: { teamId: string; onZavrit: () => void }) {
  const router = useRouter();
  const [posts, setPosts] = useState<Prispevek[] | null>(null);
  const [filtr, setFiltr] = useState<string>("vse");

  useEffect(() => {
    apiFetch<{ posts: Prispevek[] }>(`/api/teams/${teamId}/fans/feed?limit=60`)
      .then((d) => setPosts(d.posts ?? []))
      .catch((e) => { console.error("načtení Tribuny:", e); setPosts([]); });
  }, [teamId]);

  const videt = (posts ?? []).filter((p) => filtr === "vse" || p.topic === filtr);

  return (
    <div className="absolute inset-0 z-30 bg-gray-50 flex flex-col">
      {/* Lišta */}
      <div className="bg-pitch-600 text-white px-3 py-2.5 flex items-center gap-2 shrink-0">
        <button onClick={onZavrit} aria-label="Zpět" className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-lg leading-none">
          ‹
        </button>
        <span className="font-heading font-bold text-base">Socky</span>
        <span className="ml-auto text-sm text-white/70">co si o tobě píšou</span>
      </div>

      {/* Filtry */}
      <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto shrink-0">
        {FILTRY.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltr(f.key)}
            className={`px-2.5 py-1 rounded-full text-sm whitespace-nowrap ${
              filtr === f.key ? "bg-pitch-600 text-white font-semibold" : "bg-gray-100 text-ink-light"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Zeď */}
      <div className="flex-1 overflow-y-auto">
        {posts === null ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : videt.length === 0 ? (
          <div className="p-6 text-center text-muted">
            <div className="text-3xl mb-2">🏟️</div>
            <p className="text-sm">
              {posts.length === 0
                ? "Zatím nikdo nic nenapsal. Odehraj zápas nebo udělej něco, co stojí za řeč."
                : "V téhle kategorii zatím nic není."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {videt.map((p) => (
              <article key={p.id} className={`bg-white px-3 py-3 flex gap-2.5 border-l-4 ${pruh(p.tone)}`}>
                <Avatar p={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-heading font-bold text-sm text-ink truncate">{p.author}</span>
                    {p.authorKind === "vudce" && (
                      <span className="text-sm px-1 py-px rounded bg-pitch-50 text-pitch-600 font-semibold shrink-0">vůdce</span>
                    )}
                    <span className="text-sm text-muted truncate">{p.handle}</span>
                    <span className="text-sm text-muted shrink-0">· {pred(p.createdAt)}</span>
                  </div>
                  <p className="text-sm text-ink leading-snug mt-0.5 break-words">{p.body}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-muted">
                    <span title="Kolik lidí se pod to podepsalo">❤️ {p.likes}</span>
                    <span>{TEMA_IKONA[p.topic] ?? ""}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Odkaz na party — kdo chce čísla, najde je vedle */}
      <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-2 text-center">
        <button
          onClick={() => router.push("/dashboard/fans")}
          className="text-sm text-pitch-600 font-semibold hover:underline"
        >
          Skupiny fanoušků, nálada a rivalové →
        </button>
      </div>
    </div>
  );
}
