"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginBranding = { name: string; logoData: string; loginLogoData: string; loginDisplayName: string; loginCopyrightYears: string; backgroundData: string; backgroundColor: string };

export function LoginScreen({ branding }: { branding?: LoginBranding }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let frame = 0;
    try {
      const savedEmail = window.localStorage.getItem("comnet_login_email");
      if (savedEmail) frame = window.requestAnimationFrame(() => { setEmail(savedEmail); setRememberEmail(true); });
    } catch { /* Storage may be disabled in private browsing. */ }
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      try {
        if (rememberEmail) window.localStorage.setItem("comnet_login_email", email);
        else window.localStorage.removeItem("comnet_login_email");
      } catch { /* Sign-in still works if storage is unavailable. */ }
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed."); setLoading(false); }
  }

  const backgroundColor = branding && /^#[0-9a-fA-F]{6}$/.test(branding.backgroundColor) ? branding.backgroundColor : "#f3f6fa";
  const backgroundImage = branding?.backgroundData && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(branding.backgroundData) ? branding.backgroundData : "";
  const customImage = branding?.loginLogoData && /^data:image\/(png|jpeg|webp);base64,/.test(branding.loginLogoData) ? branding.loginLogoData : "";
  const companyLogo = branding?.logoData && /^data:image\/(png|jpeg|webp);base64,/.test(branding.logoData) ? branding.logoData : "";
  const displayName = branding?.loginDisplayName?.trim() || branding?.name || "ComNet-CNI";
  const years = branding?.loginCopyrightYears && /^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/.test(branding.loginCopyrightYears) ? branding.loginCopyrightYears : "1996-2021";

  return <main className="flex min-h-screen items-center justify-center bg-cover bg-center px-4 py-10 text-slate-800" style={{ backgroundColor, ...(backgroundImage ? { backgroundImage: `linear-gradient(rgb(243 246 250 / 20%), rgb(243 246 250 / 20%)), url("${backgroundImage}")` } : {}) }}>
    <div className="w-full max-w-xl space-y-7 text-center">
      <div className="flex min-h-36 flex-col items-center justify-center gap-2">
        {customImage ? <Image src={customImage} alt={`${displayName} sign-in image`} width={480} height={340} unoptimized priority className="max-h-80 w-auto max-w-full object-contain" /> : <>
          {companyLogo ? <Image src={companyLogo} alt={`${displayName} logo`} width={280} height={130} unoptimized priority className="max-h-32 w-auto max-w-full object-contain" /> : <div className="grid size-20 place-items-center rounded-2xl bg-white shadow-sm"><ShieldCheck className="size-10 text-blue-600" /></div>}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{displayName}</h1>
        </>}
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white px-6 py-8 text-left shadow-lg sm:px-10">
        <h2 className="pb-2 text-center text-xl font-bold text-slate-700">Log in to start your session</h2>
        <div><Label htmlFor="email" className="sr-only">Email</Label><div className="flex overflow-hidden rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-blue-500"><Input id="email" type="email" autoComplete="username" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus className="h-12 flex-1 rounded-none border-0 bg-blue-50 px-4 text-base shadow-none focus-visible:ring-0" /><span className="grid w-14 shrink-0 place-items-center border-l border-slate-300 text-slate-500"><Mail className="size-5" /></span></div></div>
        <div><Label htmlFor="password" className="sr-only">Password</Label><div className="flex overflow-hidden rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-blue-500"><Input id="password" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required className="h-12 flex-1 rounded-none border-0 bg-blue-50 px-4 text-base shadow-none focus-visible:ring-0" /><span className="grid w-14 shrink-0 place-items-center border-l border-slate-300 text-slate-500"><LockKeyhole className="size-5" /></span></div></div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="size-4 accent-blue-600" />Remember email</label><Button type="submit" disabled={loading} className="min-w-32 bg-blue-600 px-6 text-white hover:bg-blue-700"><KeyRound className="size-4" />{loading ? "Signing in…" : "Log In"}</Button></div>
      </form>
      <p className="rounded-md bg-white/70 px-3 py-2 text-sm font-semibold text-slate-800">Copyright © {years} <span className="text-blue-700">{displayName}</span> All rights reserved.</p>
    </div>
  </main>;
}
