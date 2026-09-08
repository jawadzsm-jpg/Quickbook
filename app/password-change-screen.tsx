"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordChangeScreen({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change password.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change password."); setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
    <div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><KeyRound className="size-6" /></div><div><h1 className="text-xl font-bold">Create your password</h1><p className="text-sm text-slate-500">Temporary access for {email}</p></div></div>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Change your temporary password before opening the accounting system.</p>
    <div className="space-y-2"><Label htmlFor="currentPassword">Temporary password</Label><Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
    <div className="space-y-2"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div>
    <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</p>}
    <Button type="submit" disabled={loading} className="w-full">{loading ? "Changing…" : "Change password"}</Button>
  </form></main>;
}
