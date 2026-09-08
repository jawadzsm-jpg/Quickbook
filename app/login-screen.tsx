"use client";

import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed."); setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
      <div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="size-6" /></div><div><h1 className="text-xl font-bold text-slate-950">ComNet Accounting</h1><p className="text-sm text-slate-500">Authorized users only</p></div></div>
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"><KeyRound className="size-4" />{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  </main>;
}
