"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, LockKeyhole, Mail } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForgotPasswordForm, ResetPasswordForm } from "./password-reset-forms";

import { IDLE_NOTICE_KEY } from "@/lib/idle-timeout";
import type { PublicLoginBranding } from "@/lib/public-login-branding";

export function LoginScreen({ branding: initialBranding, companies = [] }: { branding?: PublicLoginBranding; companies?: { id: number; name: string }[] }) {
  const [branding, setBranding] = useState(initialBranding);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialBranding?.id ?? 0);
  const [brandLoading, setBrandLoading] = useState(false);
  const brandRequest = useRef<AbortController | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Two-step sign-in: shown after a correct password when the account uses an authenticator app.
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");
  const [resetToken, setResetToken] = useState("");

  const chooseCompany = useCallback(async (companyId: number) => {
    if (!companies.some((company) => company.id === companyId)) return;
    brandRequest.current?.abort();
    const controller = new AbortController();
    brandRequest.current = controller;
    setSelectedCompanyId(companyId);
    setBrandLoading(true);
    setBranding(undefined);
    setError("");
    try {
      const response = await fetch(`/api/login-branding?companyId=${companyId}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load the company login page.");
      setBranding(result.branding as PublicLoginBranding);
      try { window.localStorage.setItem("comnet_login_company", String(companyId)); } catch { /* Storage is optional. */ }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setSelectedCompanyId(initialBranding?.id ?? 0);
      setBranding(initialBranding);
      setError(cause instanceof Error ? cause.message : "Could not load the company login page.");
    } finally {
      if (!controller.signal.aborted) setBrandLoading(false);
    }
  }, [companies, initialBranding]);

  useEffect(() => {
    const frames: number[] = [];
    try {
      // A "forgot password" email link opens /?reset=<token>; keep the token in memory and drop it from the address bar.
      const url = new URL(window.location.href);
      const token = url.searchParams.get("reset");
      if (token) {
        url.searchParams.delete("reset");
        window.history.replaceState(null, "", url);
        frames.push(window.requestAnimationFrame(() => { setResetToken(token); setMode("reset"); }));
      }
      const signOutNotice = window.sessionStorage.getItem(IDLE_NOTICE_KEY);
      if (signOutNotice) { window.sessionStorage.removeItem(IDLE_NOTICE_KEY); frames.push(window.requestAnimationFrame(() => setNotice(signOutNotice))); }
      const savedEmail = window.localStorage.getItem("comnet_login_email");
      if (savedEmail) frames.push(window.requestAnimationFrame(() => { setEmail(savedEmail); setRememberEmail(true); }));
      const requested = new URLSearchParams(window.location.search).get("company") || window.localStorage.getItem("comnet_login_company");
      const companyId = Number(requested);
      if (requested && companyId !== initialBranding?.id && companies.some((company) => company.id === companyId)) {
        frames.push(window.requestAnimationFrame(() => { void chooseCompany(companyId); }));
      }
    } catch { /* Storage may be disabled in private browsing. */ }
    return () => { frames.forEach((frame) => window.cancelAnimationFrame(frame)); brandRequest.current?.abort(); };
  }, [chooseCompany, companies, initialBranding?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, ...(mfaStep ? { mfaCode } : {}) }) });
      const data = await response.json();
      if (data.mfaRequired) {
        // The password was right; ask for the authenticator code (the error explains a wrong or missing code).
        if (mfaStep) setError(data.error || "The code is incorrect."); else { setMfaStep(true); setMfaCode(""); }
        setLoading(false);
        return;
      }
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
  const upperImage = branding?.loginLogoData && /^data:image\/(png|jpeg|webp);base64,/.test(branding.loginLogoData) ? branding.loginLogoData : "";
  const companyImage = branding?.loginCompanyLogoData || branding?.logoData || "";
  const companyLogo = /^data:image\/(png|jpeg|webp);base64,/.test(companyImage) ? companyImage : "";
  const displayName = branding?.loginDisplayName?.trim() || branding?.name || companies.find((company) => company.id === selectedCompanyId)?.name || "EasyBook Online Accounting ERP";
  const topLogoData = branding?.loginTopLogoData && /^data:image\/(png|jpeg|webp);base64,/.test(branding.loginTopLogoData) ? branding.loginTopLogoData : "";
  const topLogoStyle = branding?.loginLogoOffset ? { transform: `translateY(${branding.loginLogoOffset}px)` } : undefined;
  const topLogo = branding?.loginTopLogoHidden ? null : topLogoData
    ? <Image src={topLogoData} alt={`${displayName} logo`} width={600} height={400} unoptimized priority className="relative h-32 w-auto max-w-full rounded-2xl object-contain drop-shadow-sm" style={topLogoStyle} />
    : <Image src="/easybook-logo.png" alt="" width={1200} height={800} priority className="relative h-32 w-auto max-w-full rounded-2xl object-contain drop-shadow-sm" style={topLogoStyle} />;
  const companyImages = <>
    {upperImage ? <Image src={upperImage} alt={`${displayName} upper login image`} width={380} height={240} unoptimized priority className="max-h-52 w-auto max-w-full object-contain" /> : null}
    {companyLogo ? <Image src={companyLogo} alt={`${displayName} company logo`} width={420} height={130} unoptimized priority className="max-h-20 w-auto max-w-full object-contain drop-shadow-sm" /> : null}
  </>;
  const years = branding?.loginCopyrightYears && /^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/.test(branding.loginCopyrightYears) ? branding.loginCopyrightYears : "1996-2021";

  return <main className="login-workspace relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center px-4 py-8 text-slate-800 sm:py-12" style={{ backgroundColor, ...(backgroundImage ? { backgroundImage: `linear-gradient(rgb(243 246 250 / 30%), rgb(243 246 250 / 30%)), url("${backgroundImage}")` } : {}) }}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.1),rgba(248,250,252,.38))]" />
    <div className="relative w-full max-w-lg space-y-6 text-center">
      <div className="flex min-h-32 flex-col items-center justify-center gap-3">
        {/* The top logo (EasyBook, or the company's uploaded replacement) comes first unless the company swapped the
            order or hid it; Admin Controls → Company setup → Login page can also move it up or down. */}
        <h1 className="sr-only">EasyBook Online Accounting ERP</h1>
        {branding?.loginLogosSwapped ? <>{companyImages}{topLogo}</> : <>{topLogo}{companyImages}</>}
        <p className="text-lg font-semibold tracking-tight text-slate-950">{displayName}</p>
      </div>

      {mode === "forgot" ? <ForgotPasswordForm initialEmail={email} onBack={() => setMode("login")} /> : null}
      {mode === "reset" ? <ResetPasswordForm token={resetToken} onDone={() => { setResetToken(""); setMode("login"); }} /> : null}
      {mode === "login" ? <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/70 bg-white/95 px-5 py-7 text-left shadow-[0_24px_70px_rgb(15_23_42/0.16)] ring-1 ring-slate-200/70 backdrop-blur sm:px-8 sm:py-8">
        <div className="space-y-1 text-center"><h2 className="text-xl font-semibold tracking-tight text-slate-900">Welcome back</h2><p className="text-sm text-slate-500">Sign in to continue to your accounting workspace.</p></div>
        {companies.length > 1 ? <div><Label htmlFor="login-company">Company</Label><select id="login-company" value={selectedCompanyId} disabled={brandLoading} onChange={(event) => {
          const companyId = Number(event.target.value);
          const url = new URL(window.location.href);
          url.searchParams.set("company", String(companyId));
          window.history.replaceState(null, "", url);
          void chooseCompany(companyId);
        }} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-xs outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15">
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select></div> : null}
        <div className="space-y-2"><Label htmlFor="email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="email" type="email" autoComplete="username" placeholder="name@company.com" value={email} onChange={(event) => { setEmail(event.target.value); setMfaStep(false); }} required autoFocus className="h-11 bg-white pl-10 text-base sm:text-sm" /></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="password">Password</Label><button type="button" onClick={() => { setError(""); setMode("forgot"); }} className="text-sm font-medium text-blue-700 hover:underline">Forgot password?</button></div><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => { setPassword(event.target.value); setMfaStep(false); }} required className="h-11 bg-white pl-10 text-base sm:text-sm" /></div></div>
        {mfaStep && <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3"><Label htmlFor="mfa-code">Authenticator code</Label><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={11} placeholder="123 456" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required className="h-11 bg-white text-center font-mono text-lg tracking-[0.3em]" /><p className="text-xs text-slate-600">Open your authenticator app and enter the 6-digit code for EasyBook. Lost your phone? Enter one of your backup codes, or ask your administrator to reset two-step sign-in.</p></div>}
        {notice && !error && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="size-4 rounded accent-blue-600" />Remember email</label><Button type="submit" disabled={loading} className="h-11 min-w-36 bg-blue-600 px-6 text-white shadow-sm hover:bg-blue-700"><KeyRound className="size-4" />{loading ? "Signing in…" : mfaStep ? "Verify" : "Log In"}</Button></div>
      </form> : null}
      <p className="px-3 text-xs font-medium text-slate-600">Copyright © {years} <span className="text-blue-700">{displayName}</span>. All rights reserved.</p>
    </div>
  </main>;
}
