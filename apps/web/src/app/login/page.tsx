"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Button, Input, ErrorBox } from "@/components/ui";

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
    <main className="min-h-screen bg-auth relative overflow-hidden flex items-center justify-center p-4">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-pitch-400/[0.08]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-gold-500/[0.04]" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/[0.03]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-white/[0.03]" />
      </div>

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-12 animate-slide-up">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-[2px] w-8 bg-gradient-to-r from-transparent to-gold-500/40" />
            <span className="text-label text-gold-500/60">Est. 2024</span>
            <div className="h-[2px] w-8 bg-gradient-to-l from-transparent to-gold-500/40" />
          </div>
          <h1 className="text-display text-white">
            PRA<span className="text-pitch-400">L</span>ES
          </h1>
          <p className="text-label text-white/25 mt-3">Fotbalový manažer</p>
        </div>

        {/* Form */}
        <div className="animate-slide-up" style={{ animationDelay: "80ms" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input variant="dark" label="Email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="tvuj@email.cz" required />

            <Input variant="dark" label="Heslo" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Tvoje heslo" required />

            <ErrorBox message={error} variant="dark" />

            <Button variant="primary-dark" size="xl" type="submit" disabled={loading} className="w-full mt-2">
              {loading ? "Přihlašuji..." : "Přihlásit se"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="divider-dark flex-1" />
            <span className="text-white/15 text-xs">nebo</span>
            <div className="divider-dark flex-1" />
          </div>

          <p className="text-center text-sm text-white/30">
            Nemáš účet?{" "}
            <Link href="/register" className="text-pitch-300 font-semibold hover:text-white transition-colors">
              Zaregistrovat se
            </Link>
          </p>
        </div>

        {/* Bottom tagline */}
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
