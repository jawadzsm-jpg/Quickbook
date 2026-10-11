"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, KeyRound, LockKeyhole, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const cardClass = "space-y-5 rounded-2xl border border-white/70 bg-white/95 px-5 py-7 text-left shadow-[0_24px_70px_rgb(15_23_42/0.16)] ring-1 ring-slate-200/70 backdrop-blur sm:px-8 sm:py-8";
const backButton = (onBack: () => void) => <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"><ArrowLeft className="size-4" />Back to sign in</button>;

export function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send the reset link.");
      setMessage(data.message || "Check your email for the reset link.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the reset link."); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit} className={cardClass}>
    <div className="space-y-1 text-center"><h2 className="text-xl font-semibold tracking-tight text-slate-900">Forgot your password?</h2><p className="text-sm text-slate-500">Enter your login email and we will send you a link to choose a new one.</p></div>
    <div className="space-y-2"><Label htmlFor="reset-email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="reset-email" type="email" autoComplete="username" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus className="h-11 bg-white pl-10 text-base sm:text-sm" /></div></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p>}
    <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">{backButton(onBack)}<Button type="submit" disabled={loading} className="h-11 min-w-36 bg-blue-600 px-6 text-white shadow-sm hover:bg-blue-700"><Send className="size-4" />{loading ? "Sending…" : "Send reset link"}</Button></div>
  </form>;
}

export function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset the password.");
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reset the password."); }
    finally { setLoading(false); }
  }
  if (done) return <div className={cardClass}>
    <div className="space-y-1 text-center"><h2 className="text-xl font-semibold tracking-tight text-slate-900">Password changed</h2><p className="text-sm text-slate-500">You can now sign in with your new password.</p></div>
    <Button type="button" onClick={onDone} className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"><KeyRound className="size-4" />Go to sign in</Button>
  </div>;
  return <form onSubmit={submit} className={cardClass}>
    <div className="space-y-1 text-center"><h2 className="text-xl font-semibold tracking-tight text-slate-900">Choose a new password</h2><p className="text-sm text-slate-500">Use 12 to 128 characters. Other devices will be signed out.</p></div>
    <div className="space-y-2"><Label htmlFor="reset-new-password">New password</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="reset-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required autoFocus className="h-11 bg-white pl-10 text-base sm:text-sm" /></div></div>
    <div className="space-y-2"><Label htmlFor="reset-confirm-password">Confirm new password</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="reset-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="h-11 bg-white pl-10 text-base sm:text-sm" /></div></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
    <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">{backButton(onDone)}<Button type="submit" disabled={loading} className="h-11 min-w-36 bg-blue-600 px-6 text-white shadow-sm hover:bg-blue-700"><KeyRound className="size-4" />{loading ? "Saving…" : "Save password"}</Button></div>
  </form>;
}
