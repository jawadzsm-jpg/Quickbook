"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PasswordField({ id, label, value, onChange, autoComplete, visible }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; visible: boolean }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={autoComplete === "new-password" ? 12 : undefined} maxLength={128} value={value} onChange={(event) => onChange(event.target.value)} required /></div>;
}

/**
 * Change password for every signed-in user (sidebar, next to Sign out). Uses PATCH /api/auth/session, which checks the
 * current password and signs the user out everywhere, so they sign in again with the new one.
 */
export function ChangePasswordButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) { setCurrent(""); setNext(""); setConfirm(""); setVisible(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next.length < 12) return toast.error("The new password must contain at least 12 characters.");
    if (next !== confirm) return toast.error("The new password and confirmation do not match.");
    if (next === current) return toast.error("Choose a password that is different from the current one.");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not change the password.");
      toast.success("Password changed. Sign in again with your new password.");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change the password."); setSaving(false); }
  }

  const strength = next.length >= 16 && /[A-Z]/.test(next) && /[0-9]/.test(next) && /[^A-Za-z0-9]/.test(next) ? "Strong" : next.length >= 12 ? "Acceptable" : next ? "Too short" : "";

  return <>
    <Button type="button" variant="ghost" size="icon" aria-label="Change password" title="Change password" onClick={() => setOpen(true)} className="size-8 shrink-0 text-slate-400 hover:bg-white/10 hover:text-white"><KeyRound className="size-4" /></Button>
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Change password</DialogTitle><DialogDescription>{email} · You will be signed out on every device and sign in again with the new password.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <PasswordField id="change-current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" visible={visible} />
          <PasswordField id="change-new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password" visible={visible} />
          {strength && <p className={`text-xs ${strength === "Too short" ? "text-destructive" : strength === "Strong" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>Strength: {strength}{strength !== "Strong" ? " · 16+ characters with upper-case, numbers and symbols is strongest" : ""}</p>}
          <PasswordField id="change-confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" visible={visible} />
          {confirm && next !== confirm && <p className="text-xs text-destructive">The new passwords do not match.</p>}
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{visible ? "Hide passwords" : "Show passwords"}</button>
          <p className="text-xs text-muted-foreground">Forgot your current password? Sign out and use <strong>Forgot password?</strong> on the sign-in page to get a reset link by email.</p>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => reset(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Changing…" : "Change password"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
