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
  const [focused, setFocused] = useState<string | null>(null);
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
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{ background: "linear-gradient(145deg, #0a1a0a 0%, #0d2a0d 30%, #122412 60%, #1a1410 100%)" }}>

      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Radial glow */}
        <div className="absolute top-[-20%] left-[50%] translate-x-[-50%] w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(58,122,58,0.12) 0%, transparent 70%)" }} />
        {/* Gold accent glow */}
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(196,160,53,0.06) 0%, transparent 70%)" }} />
        {/* Field lines */}
        <div className="absolute top-[50%] left-0 right-0 h-px bg-white/[0.03]" />
        <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-32 h-32 rounded-full border border-white/[0.03]" />
      </div>

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo section */}
        <div className="text-center mb-12 animate-slide-up">
          {/* Diagonal accent bars */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-[2px] w-8 bg-gradient-to-r from-transparent to-gold-500/40" />
            <span className="text-gold-500/60 text-xs font-heading font-semibold tracking-[0.2em] uppercase">Est. 2024</span>
            <div className="h-[2px] w-8 bg-gradient-to-l from-transparent to-gold-500/40" />
          </div>

          <h1 className="font-heading font-[800] text-[4.5rem] leading-[0.85] tracking-[-0.03em] text-white uppercase">
            PRA<span className="text-pitch-400">L</span>ES
          </h1>
          <p className="text-white/25 text-[0.8rem] mt-3 tracking-[0.15em] uppercase font-heading font-medium">
            Fotbalový manažer
          </p>
        </div>

        {/* Form */}
        <div className="animate-slide-up" style={{ animationDelay: "80ms" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-[0.7rem] font-semibold tracking-[0.1em] uppercase">Email</span>
              </label>
              <div className={`relative rounded-xl transition-all duration-200 ${focused === "email" ? "ring-2 ring-pitch-400/30" : ""}`}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  placeholder="tvuj@email.cz"
                  required
                  className="w-full px-4 py-4 bg-white/[0.05] border border-white/[0.07] rounded-xl text-white text-[0.95rem] placeholder:text-white/15 focus:border-pitch-400/50 focus:bg-white/[0.07] focus:outline-none transition-all"
                />
                {focused === "email" && (
                  <div className="absolute left-0 bottom-0 h-[2px] bg-gradient-to-r from-pitch-400 to-pitch-400/0 rounded-full" style={{ width: "60%" }} />
                )}
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-[0.7rem] font-semibold tracking-[0.1em] uppercase">Heslo</span>
              </label>
              <div className={`relative rounded-xl transition-all duration-200 ${focused === "password" ? "ring-2 ring-pitch-400/30" : ""}`}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  placeholder="Tvoje heslo"
                  required
                  className="w-full px-4 py-4 bg-white/[0.05] border border-white/[0.07] rounded-xl text-white text-[0.95rem] placeholder:text-white/15 focus:border-pitch-400/50 focus:bg-white/[0.07] focus:outline-none transition-all"
                />
                {focused === "password" && (
                  <div className="absolute left-0 bottom-0 h-[2px] bg-gradient-to-r from-pitch-400 to-pitch-400/0 rounded-full" style={{ width: "60%" }} />
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 text-red-300/90 text-sm bg-red-500/8 border border-red-400/10 px-4 py-3 rounded-xl">
                <span className="text-red-400">&#10005;</span> {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-2 rounded-xl font-heading font-bold text-lg text-white disabled:opacity-40 transition-all active:scale-[0.98] relative overflow-hidden group"
              style={{ background: "linear-gradient(135deg, #3A7A3A 0%, #2D5F2D 50%, #1E4A1E 100%)" }}
            >
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(45,95,45,0.3)" }} />
              <span className="relative">{loading ? "Přihlašuji..." : "Přihlásit se"}</span>
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-white/15 text-xs">nebo</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-white/30">
            Nemáš účet?{" "}
            <Link href="/register" className="text-pitch-300 font-semibold hover:text-white transition-colors">
              Zaregistrovat se
            </Link>
          </p>
        </div>

        {/* Bottom tag */}
        <div className="mt-16 text-center animate-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="inline-flex items-center gap-2 text-white/10 text-xs">
            <div className="w-1 h-1 rounded-full bg-pitch-500/40" />
            <span>Okresní fotbal. Reálné obce. Český humor.</span>
            <div className="w-1 h-1 rounded-full bg-pitch-500/40" />
          </div>
        </div>
      </div>
    </main>
  );
}
