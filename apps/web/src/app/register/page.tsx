"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
        user: { id: string; email: string; displayName: string; teamId: string | null };
      }>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      login(result.token, { id: result.user.id, email: result.user.email, teamId: null, teamName: null });
      router.push("/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:border-pitch-400 focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-pitch-400/20 transition-all";
  const labelClass = "block text-white/50 text-xs font-semibold tracking-wide uppercase mb-2";

  return (
    <main className="min-h-screen bg-pitch-800 flex items-center justify-center p-4">
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
          <h2 className="text-white text-xl font-semibold mb-1">Vytvoř si účet</h2>
          <p className="text-white/40 text-sm mb-8">Za minutu budeš mít svůj tým</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>Jméno</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jak ti říkají" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tvuj@email.cz" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Heslo</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Alespoň 6 znaků" required minLength={6} className={inputClass} />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">
                &#9888; {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-pitch-500 hover:bg-pitch-400 disabled:opacity-40 text-white font-heading font-bold text-lg rounded-xl shadow-lg shadow-pitch-500/20 hover:shadow-pitch-400/30 transition-all active:scale-[0.98]">
              {loading ? "Registruji..." : "Založit účet a začít hrát"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/30 mt-6 animate-slide-up" style={{ animationDelay: "200ms" }}>
          Už máš účet?{" "}
          <Link href="/login" className="text-pitch-300 font-semibold hover:text-pitch-200 transition-colors">
            Přihlásit se
          </Link>
        </p>
      </div>
    </main>
  );
}
