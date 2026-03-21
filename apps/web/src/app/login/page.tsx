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

      if (result.user.teamId) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">&#9917;</div>
          <h1 className="font-heading text-3xl font-extrabold text-pitch-500">Okresní Mašina</h1>
          <p className="text-muted mt-1">Přihlásit se</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tvuj@email.cz"
              required
              className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted block mb-1">Heslo</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tvoje heslo"
              required
              className="w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-card-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pitch-500 hover:bg-pitch-400 disabled:bg-gray-300 text-white font-heading text-lg font-bold py-3 rounded-card shadow-card transition-all"
          >
            {loading ? "Přihlašuji..." : "Přihlásit se"}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Nemáš účet?{" "}
          <Link href="/register" className="text-pitch-500 font-medium hover:underline">
            Zaregistrovat se
          </Link>
        </p>
      </div>
    </main>
  );
}
