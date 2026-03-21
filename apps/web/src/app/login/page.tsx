"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useTeam();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{
        token: string;
        user: { id: string; email: string; teamId: string | null; teamName: string | null };
      }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      login(result.token, result.user);
      router.push(result.user.teamId ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-pitch-800 flex items-center justify-center p-4">
      {/* Central card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pitch-500 mb-4 shadow-lg">
            <span className="text-3xl">&#9917;</span>
          </div>
          <h1 className="text-display text-white tracking-tight">PRALES</h1>
          <p className="text-pitch-300/60 text-sm mt-2">Fotbalový manažer z českého okresu</p>
        </div>

        {/* Form card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <h2 className="text-white text-xl font-semibold mb-1">Vítej zpátky</h2>
          <p className="text-white/40 text-sm mb-8">Přihlas se ke svému týmu</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-white/50 text-xs font-semibold tracking-wide uppercase mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tvuj@email.cz"
                required
                className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:border-pitch-400 focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-pitch-400/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/50 text-xs font-semibold tracking-wide uppercase mb-2">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tvoje heslo"
                required
                className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:border-pitch-400 focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-pitch-400/20 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">
                &#9888; {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-pitch-500 hover:bg-pitch-400 disabled:opacity-40 text-white font-heading font-bold text-lg rounded-xl shadow-lg shadow-pitch-500/20 hover:shadow-pitch-400/30 transition-all active:scale-[0.98]"
            >
              {loading ? "Přihlašuji..." : "Přihlásit se"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-white/30 mt-6 animate-slide-up" style={{ animationDelay: "200ms" }}>
          Nemáš účet?{" "}
          <Link href="/register" className="text-pitch-300 font-semibold hover:text-pitch-200 transition-colors">
            Zaregistrovat se
          </Link>
        </p>
      </div>
    </main>
  );
}
