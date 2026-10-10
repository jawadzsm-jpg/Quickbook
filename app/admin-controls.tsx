"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, Smile, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AdminBackupCenter, type BackupStatus } from "./admin-backup-center";
import { SmtpSettings } from "./smtp-settings";
import { UserRoleCenter, type UserSummary } from "./user-role-center";

type Tab = "users" | "security" | "email" | "backups";
type Override = { id: number; entityId: number; details: string; createdAt: string };
type PinState = { configured: boolean; lastChange: { action: string; createdAt: string } | null; overrides: Override[]; shareEmojis?: boolean };

const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
  { id: "users", label: "Users & access", icon: Users },
  { id: "security", label: "Security", icon: LockKeyhole },
  { id: "email", label: "Email server", icon: Mail },
  { id: "backups", label: "Backups", icon: Archive },
];
// Database timestamps can arrive as "2026-10-08 10:21:08+04"; normalise them so every browser parses them.
const parseTime = (value: string) => new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
const uaeTime = (value: string | null | undefined) => value ? parseTime(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "—";
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 12);
const tabStorageKey = "comnet-admin-controls-tab";

function PasswordInput({ id, label, value, onChange, autoComplete, minLength, numeric }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number; numeric?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="relative"><Input id={id} type={visible ? "text" : "password"} inputMode={numeric ? "numeric" : undefined} pattern={numeric ? "[0-9]{4,12}" : undefined} autoComplete={autoComplete} minLength={minLength} maxLength={numeric ? 12 : 128} value={value} onChange={(event) => onChange(numeric ? digits(event.target.value) : event.target.value)} required className="pr-10" /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>;
}

function SecurityPanel({ companyId, companyName, currentUserEmail, onPinStatus }: { companyId: number; companyName: string; currentUserEmail: string; onPinStatus: (configured: boolean) => void }) {
  const [pin, setPin] = useState<PinState | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [removing, setRemoving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    const response = await fetch(`/api/admin-settings?companyId=${companyId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load security settings");
    return data as PinState;
  }, [companyId]);
  const apply = useCallback((data: PinState) => { setPin(data); onPinStatus(Boolean(data.configured)); }, [onPinStatus]);
  const load = useCallback(() => fetchSettings().then(apply).catch((error) => { toast.error(error instanceof Error ? error.message : "Could not load security settings"); }), [fetchSettings, apply]);

  useEffect(() => {
    let active = true;
    fetchSettings().then((data) => { if (active) apply(data); }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load security settings"); });
    return () => { active = false; };
  }, [fetchSettings, apply]);

  async function savePin(event: FormEvent) {
    event.preventDefault();
    if (removing) {
      if (!window.confirm(`Remove the admin PIN for ${companyName}? Negative-stock overrides will be blocked until a new PIN is set.`)) return;
    } else {
      if (!/^\d{4,12}$/.test(newPin)) return toast.error("The new PIN must contain 4 to 12 numbers.");
      if (newPin !== confirmPin) return toast.error("The new PIN and confirmation do not match.");
      if (pin?.configured && newPin === currentPin) return toast.error("Choose a PIN that is different from the current PIN.");
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, currentPin, newPin, action: removing ? "clear" : "set" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the admin PIN");
      toast.success(removing ? "Admin PIN removed — overrides are disabled" : pin?.configured ? "Admin PIN changed" : "Admin PIN set");
      setCurrentPin(""); setNewPin(""); setConfirmPin(""); setRemoving(false);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the admin PIN"); }
    finally { setSaving(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12) return toast.error("The new password must contain at least 12 characters.");
    if (newPassword !== confirmPassword) return toast.error("The new password and confirmation do not match.");
    if (newPassword === currentPassword) return toast.error("Choose a password that is different from the current one.");
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/auth/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change the password");
      toast.success("Password changed. Sign in again.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change the password"); setPasswordSaving(false); }
  }

  const configured = Boolean(pin?.configured);
  const shareEmojis = pin?.shareEmojis !== false;
  async function setShareEmojis(enabled: boolean) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action: "share-emojis", enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change share emoji");
      setPin((current) => current ? { ...current, shareEmojis: data.shareEmojis } : current);
      toast.success(enabled ? "Share emoji turned on" : "Share emoji turned off");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change share emoji"); } finally { setSaving(false); }
  }
  const strength = newPassword.length >= 16 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword) ? "Strong" : newPassword.length >= 12 ? "Acceptable" : newPassword ? "Too short" : "";

  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="min-w-0 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5 xl:col-span-2" aria-label="Share emoji">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300"><Smile className="size-5" /></div><div><h2 className="text-lg font-semibold">Share emoji</h2><p className="text-sm text-muted-foreground">Emoji in Inventory Overview WhatsApp and Telegram messages for {companyName}. Each user picks their own style; off shares plain text for everyone.</p></div></div>
        <label className="inline-flex items-center gap-2 text-sm font-medium"><Switch checked={shareEmojis} disabled={saving || !pin} onCheckedChange={(checked) => void setShareEmojis(checked)} aria-label="Share emoji on or off" />{shareEmojis ? "On" : "Off"}</label></div>
    </section>
    <section className="min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Negative-stock override PIN">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5"><div className="flex gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300"><KeyRound className="size-5" /></div><div><h2 className="text-lg font-semibold">Negative-stock override PIN</h2><p className="mt-1 text-sm text-muted-foreground">Applies to {companyName} only.</p></div></div><Badge variant="secondary" className={configured ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-300"}>{!pin ? "Checking…" : configured ? "PIN configured" : "Setup required"}</Badge></header>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6">Invoices and sales receipts are blocked when stock is insufficient. An administrator can enter this PIN on the document to approve an exception. Every override is recorded in the audit log.{pin?.lastChange ? <span className="mt-1 block text-xs text-muted-foreground">Last {pin.lastChange.action === "removed" ? "removed" : "updated"}: {uaeTime(pin.lastChange.createdAt)}</span> : null}</p>
        <form onSubmit={savePin} className="space-y-4">
          {configured && <PasswordInput id="currentAdminPin" label="Current PIN" value={currentPin} onChange={setCurrentPin} autoComplete="current-password" numeric />}
          {!removing && <div className="grid gap-4 sm:grid-cols-2"><PasswordInput id="newAdminPin" label="New PIN" value={newPin} onChange={setNewPin} autoComplete="new-password" numeric /><PasswordInput id="confirmAdminPin" label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} autoComplete="new-password" numeric /></div>}
          {!removing && newPin && confirmPin && newPin !== confirmPin && <p className="text-xs text-destructive">The PINs do not match.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {configured ? <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={removing} onChange={(event) => setRemoving(event.target.checked)} />Remove PIN and disable overrides</label> : <span className="text-xs text-muted-foreground">Use 4 to 12 numbers.</span>}
            <Button type="submit" variant={removing ? "destructive" : "default"} disabled={!pin || saving}>{saving ? "Saving…" : removing ? "Remove admin PIN" : configured ? "Change admin PIN" : "Set admin PIN"}</Button>
          </div>
        </form>
        <div><h3 className="text-sm font-semibold">Recent overrides</h3>{!pin?.overrides.length ? <p className="mt-2 text-sm text-muted-foreground">No negative-stock overrides recorded for this company.</p> : <ul className="mt-2 divide-y rounded-xl border text-sm">{pin.overrides.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="min-w-0 truncate">{entry.details.split(";")[0]}</span><span className="text-xs text-muted-foreground">{uaeTime(entry.createdAt)}</span></li>)}</ul>}</div>
      </div>
    </section>
    <section className="min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Your login password">
      <header className="flex gap-3 border-b p-4 sm:p-5"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-5" /></div><div className="min-w-0"><h2 className="text-lg font-semibold">Your login password</h2><p className="mt-1 truncate text-sm text-muted-foreground">{currentUserEmail}</p></div></header>
      <form onSubmit={savePassword} className="space-y-4 p-4 sm:p-5">
        <PasswordInput id="currentLoginPassword" label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordInput id="newLoginPassword" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} />
        {strength && <p className={`text-xs ${strength === "Too short" ? "text-destructive" : strength === "Strong" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>Strength: {strength}{strength !== "Strong" ? " · 16+ characters with upper-case, numbers and symbols is strongest" : ""}</p>}
        <PasswordInput id="confirmLoginPassword" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={12} />
        <Button type="submit" disabled={passwordSaving} className="w-full">{passwordSaving ? "Changing…" : "Change login password"}</Button>
        <p className="text-sm leading-5 text-muted-foreground">Changing the password signs out every active session, including this one.</p>
      </form>
    </section>
  </div>;
}

export function AdminControlsCenter({ companyId, companyName, currentUserEmail, canManageEmail }: { companyId: number; companyName: string; currentUserEmail: string; canManageEmail: boolean }) {
  // Every administrator sees Users & access (company Administrators only for their own companies). The email server is
  // shared by every company, so only an All-Admin sees it; the APIs enforce the same rules.
  const visibleTabs = canManageEmail ? tabs : tabs.filter((entry) => entry.id !== "email");
  // Admin Controls only mounts after the user opens it, so reading the remembered tab here never runs during server rendering.
  const [tab, setTab] = useState<Tab>(() => {
    const fallback: Tab = "users";
    try { const saved = window.localStorage.getItem(tabStorageKey); return visibleTabs.some((entry) => entry.id === saved) ? saved as Tab : fallback; } catch { return fallback; }
  });
  const [users, setUsers] = useState<UserSummary | null>(null);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);

  function select(next: Tab) {
    setTab(next);
    try { window.localStorage.setItem(tabStorageKey, next); } catch { /* the remembered tab is optional */ }
  }

  const allCards: Array<{ id: Tab; label: string; value: string; detail: string; warn: boolean }> = [
    { id: "users", label: "Users", value: users ? `${users.active} active` : "…", detail: users ? `${users.total} total · ${users.inactive} inactive${users.pendingPassword ? ` · ${users.pendingPassword} awaiting first sign-in` : ""}` : "Loading", warn: false },
    { id: "security", label: "Override PIN", value: pinConfigured === null ? "…" : pinConfigured ? "Configured" : "Not set", detail: `For ${companyName}`, warn: pinConfigured === false },
    { id: "email", label: "Email server", value: smtpConfigured === null ? "…" : smtpConfigured ? "Configured" : "Not set", detail: smtpConfigured === false ? "Invitations cannot be emailed" : "Invitations and password resets", warn: smtpConfigured === false },
    { id: "backups", label: "Last backup", value: backup ? backup.lastCompletedAt ? uaeTime(backup.lastCompletedAt) : "None yet" : "…", detail: backup ? backup.scheduleEnabled ? `Next: ${uaeTime(backup.nextRunAt)}` : "Automatic backups are off" : "Loading", warn: Boolean(backup && (!backup.lastCompletedAt || !backup.scheduleEnabled)) },
  ];
  const cards = allCards.filter((card) => visibleTabs.some((entry) => entry.id === card.id));

  return <div className="min-w-0 space-y-5">
    <div className={`grid gap-3 sm:grid-cols-2 ${cards.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>{cards.map((card) => <button key={card.id} type="button" onClick={() => select(card.id)} className={`min-w-0 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === card.id ? "border-primary/60 ring-1 ring-primary/30" : ""}`}><p className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}{card.warn && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-800 dark:text-amber-300">Action needed</span>}</p><p className="mt-2 truncate text-lg font-semibold tabular-nums">{card.value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{card.detail}</p></button>)}</div>
    <div role="tablist" aria-label="Admin Controls sections" className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1">{visibleTabs.map((entry) => { const Icon = entry.icon; return <button key={entry.id} role="tab" type="button" id={`admin-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls={`admin-panel-${entry.id}`} onClick={() => select(entry.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === entry.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{entry.label}</button>; })}</div>
    {/* Panels stay mounted so unsaved edits survive switching tabs and the summary cards stay current. */}
    <div role="tabpanel" id="admin-panel-users" aria-labelledby="admin-tab-users" hidden={tab !== "users"}><UserRoleCenter onSummary={setUsers} /></div>
    <div role="tabpanel" id="admin-panel-security" aria-labelledby="admin-tab-security" hidden={tab !== "security"}><SecurityPanel key={companyId} companyId={companyId} companyName={companyName} currentUserEmail={currentUserEmail} onPinStatus={setPinConfigured} /></div>
    {canManageEmail && <div role="tabpanel" id="admin-panel-email" aria-labelledby="admin-tab-email" hidden={tab !== "email"}><SmtpSettings onStatus={setSmtpConfigured} /></div>}
    <div role="tabpanel" id="admin-panel-backups" aria-labelledby="admin-tab-backups" hidden={tab !== "backups"}><AdminBackupCenter key={companyId} companyId={companyId} companyName={companyName} onStatus={setBackup} /></div>
  </div>;
}
