"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Copy, KeyRound, Mail, MapPin, Plus, Send, Server, ShieldCheck, Smartphone, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Role = "all_admin" | "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type ManagedUser = {
  id: number; fullName: string; email: string; phone: string; whatsapp: string; avatarData: string; role: Role;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; lastLoginIp: string; lastLoginUserAgent: string; isCurrent: boolean;
};
type SmtpForm = { host: string; port: string; secure: boolean; username: string; password: string; fromName: string; fromEmail: string; passwordConfigured: boolean };

const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "all_admin", label: "All-Admin", description: "Full access to every company and all administration controls" },
  { value: "admin", label: "Administrator", description: "Full access, settings and user management" },
  { value: "accountant", label: "Accountant", description: "Accounting, sales, purchases, banking and reports" },
  { value: "sales", label: "Sales", description: "Customers, invoices, receipts and stock viewing" },
  { value: "purchasing", label: "Purchasing", description: "Vendors, bills, payments and stock viewing" },
  { value: "inventory", label: "Inventory Manager", description: "Items, specifications and stock transfers" },
  { value: "viewer", label: "Viewer", description: "Read-only dashboards, inventory and reports" },
];
const roleLabel = (role: Role) => roles.find((entry) => entry.value === role)?.label ?? role;
const generatePassword = () => `CN-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}!`;
const initialSmtp: SmtpForm = { host: "smtp.gmail.com", port: "465", secure: true, username: "", password: "", fromName: "ComNet Accounting", fromEmail: "", passwordConfigured: false };

function UserAvatar({ user, size = "size-11" }: { user: Pick<ManagedUser, "avatarData" | "fullName" | "email">; size?: string }) {
  return user.avatarData ? <Image src={user.avatarData} alt={`${user.fullName || user.email} profile`} width={44} height={44} unoptimized className={`${size} shrink-0 rounded-full border object-cover`} /> : <div className={`grid ${size} shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white`}>{(user.fullName || user.email).slice(0, 2).toUpperCase()}</div>;
}

function deviceName(userAgent: string) {
  if (!userAgent) return "No login recorded";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/") ? "Safari" : userAgent.includes("Firefox/") ? "Firefox" : "Browser";
  const device = /iPhone|iPad/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : /Macintosh/.test(userAgent) ? "macOS" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : "Device";
  return `${browser} on ${device}`;
}

export function UserRoleCenter() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [avatarData, setAvatarData] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [password, setPassword] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [resetPassword, setResetPassword] = useState("");
  const [emailReset, setEmailReset] = useState(true);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load users");
      setUsers(data.users);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load users"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin-users", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load users");
      if (active) setUsers(data.users);
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load users"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 800_000) {
      event.target.value = "";
      return toast.error("Use a PNG, JPEG or WebP picture smaller than 800 KB.");
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarData(String(reader.result ?? ""));
    reader.onerror = () => toast.error("Could not read the selected picture.");
    reader.readAsDataURL(file);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault(); setCreating(true);
    try {
      const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, email, phone, whatsapp, avatarData, role, password, sendEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add user");
      const credentials = { email: email.trim().toLowerCase(), password };
      setCreateOpen(false); setCreatedCredentials(credentials); setFullName(""); setEmail(""); setPhone(""); setWhatsapp(""); setAvatarData(""); setRole("viewer"); setPassword(""); setSendEmail(true);
      await loadUsers();
      if (data.emailWarning) toast.warning(`User added. Email not sent: ${data.emailWarning}`); else toast.success(data.emailSent ? "User added and login email sent" : "User added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add user"); }
    finally { setCreating(false); }
  }

  async function updateUser(id: number, changes: Record<string, unknown>) {
    setSavingId(id);
    try {
      const response = await fetch("/api/admin-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update user");
      setUsers((current) => current.map((entry) => entry.id === id ? data.user : entry));
      if (data.emailWarning) toast.warning(`Access updated. Email not sent: ${data.emailWarning}`); else toast.success(data.emailSent ? "Access updated and email sent" : "User access updated");
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update user"); return false; }
    finally { setSavingId(null); }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault(); if (!resetUser) return;
    const changed = await updateUser(resetUser.id, { password: resetPassword, sendEmail: emailReset });
    if (changed) { setCreatedCredentials({ email: resetUser.email, password: resetPassword }); setResetUser(null); setResetPassword(""); }
  }

  async function copyCredentials(credentials: { email: string; password: string }) {
    try {
      await navigator.clipboard.writeText(`ComNet Accounting\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`);
      toast.success("Login details copied");
    } catch { toast.error("Could not copy. Select and copy the login details manually."); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">Users & roles</h2><p className="mt-1 text-sm text-slate-500">Add staff, assign access and review their most recent login.</p></div><Button onClick={() => { setPassword(generatePassword()); setCreateOpen(true); }}><Plus className="size-4" />Add user</Button></div>
      <div className="grid gap-3 border-b bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-3">{roles.map((entry) => <div key={entry.value} className="rounded-lg border bg-white p-3"><p className="text-sm font-semibold text-slate-900">{entry.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{entry.description}</p></div>)}</div>
      <div className="divide-y">{loading ? <p className="p-5 text-sm text-slate-500">Loading users…</p> : users.map((user) => <div key={user.id} className="grid items-center gap-4 p-5 xl:grid-cols-[minmax(250px,1fr)_210px_minmax(230px,.8fr)_auto]">
        <div className="flex min-w-0 items-center gap-3"><UserAvatar user={user} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{user.fullName || user.email}</p>{user.isCurrent ? <Badge variant="outline">You</Badge> : null}{user.mustChangePassword ? <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Password change required</Badge> : null}</div><p className="mt-1 truncate text-sm text-slate-500">{user.email}</p><p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">{user.phone ? <span>{user.phone}</span> : null}{user.whatsapp ? <span>WhatsApp: {user.whatsapp}</span> : null}</p></div></div>
        <Select value={user.role} disabled={user.isCurrent || savingId === user.id} onValueChange={(next) => updateUser(user.id, { role: next })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{roles.map((entry) => <SelectItem key={entry.value} value={entry.value}><span className="flex items-center gap-2"><ShieldCheck className="size-4" />{entry.label}</span></SelectItem>)}</SelectContent></Select>
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs"><p className="flex items-center gap-2 font-medium text-slate-700"><MapPin className="size-3.5" />{user.lastLoginIp || "No IP recorded"}</p><p className="mt-1 flex items-center gap-2 text-slate-500"><Smartphone className="size-3.5" />{deviceName(user.lastLoginUserAgent)}</p><p className="mt-1 text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-AE") : "Never signed in"}</p></div>
        <div className="flex flex-wrap justify-end gap-2"><Badge className={user.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{user.active ? "Active" : "Inactive"}</Badge><Button variant="outline" size="sm" disabled={user.isCurrent || savingId === user.id} onClick={() => { setResetUser(user); setResetPassword(generatePassword()); setEmailReset(true); }}><KeyRound className="size-4" />Reset</Button><Button variant="outline" size="sm" disabled={user.isCurrent || savingId === user.id} onClick={() => updateUser(user.id, { active: !user.active })}>{user.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}{user.active ? "Deactivate" : "Activate"}</Button></div>
      </div>)}</div>
    </section>

    <SmtpSettings />

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Create the profile, contact details and secure temporary login.</DialogDescription></DialogHeader><form onSubmit={createUser} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+971…" maxLength={32} /></div><div className="space-y-2"><Label>WhatsApp</Label><Input type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="+971…" maxLength={32} /></div><div className="space-y-2 sm:col-span-2"><Label>Role</Label><Select value={role} onValueChange={(value) => setRole(value as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">{roleLabel(role)} · {roles.find((entry) => entry.value === role)?.description}</p></div></div>
      <div className="rounded-xl border bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-4">{avatarData ? <Image src={avatarData} alt="Selected profile preview" width={80} height={80} unoptimized className="size-20 rounded-full border object-cover" /> : <div className="grid size-20 place-items-center rounded-full border-2 border-dashed bg-white text-slate-400"><Camera className="size-6" /></div>}<div className="space-y-2"><Label htmlFor="user-photo">User picture</Label><Input id="user-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto} className="max-w-sm bg-white" /><p className="text-xs text-slate-500">PNG, JPEG or WebP · maximum 800 KB</p></div></div></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><Label>Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setPassword(generatePassword())}>Generate</Button></div><Input value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></div>
      <label className="flex items-start gap-3 rounded-lg border p-3"><Checkbox checked={sendEmail} onCheckedChange={(checked) => setSendEmail(checked === true)} /><span><span className="block text-sm font-medium">Email login details</span><span className="block text-xs text-slate-500">Send the role, login link and temporary password using the configured SMTP server.</span></span></label>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={creating}>{creating ? "Adding…" : sendEmail ? "Add user & send email" : "Add user"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(resetUser)} onOpenChange={(open) => { if (!open) { setResetUser(null); setResetPassword(""); } }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a temporary password for {resetUser?.fullName || resetUser?.email}. Active sessions will be signed out.</DialogDescription></DialogHeader><form onSubmit={submitReset} className="space-y-4"><div className="space-y-2"><div className="flex items-center justify-between"><Label>Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setResetPassword(generatePassword())}>Generate</Button></div><Input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} maxLength={128} required /></div><label className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={emailReset} onCheckedChange={(checked) => setEmailReset(checked === true)} /><span className="text-sm font-medium">Email the new temporary password</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => setResetUser(null)}>Cancel</Button><Button type="submit" disabled={savingId === resetUser?.id}>Reset password</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(createdCredentials)} onOpenChange={(open) => { if (!open) setCreatedCredentials(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>User login created</DialogTitle><DialogDescription>The user must create a new password at first login.</DialogDescription></DialogHeader>{createdCredentials ? <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><div><p className="text-xs font-medium text-slate-500">Email</p><p className="mt-1 font-mono text-sm">{createdCredentials.email}</p></div><div><p className="text-xs font-medium text-slate-500">Temporary password</p><p className="mt-1 break-all font-mono text-sm">{createdCredentials.password}</p></div><Button type="button" variant="outline" className="w-full" onClick={() => copyCredentials(createdCredentials)}><Copy className="size-4" />Copy login details</Button></div> : null}<DialogFooter><Button onClick={() => setCreatedCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function SmtpSettings() {
  const [form, setForm] = useState<SmtpForm>(initialSmtp);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/email-settings", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load SMTP settings");
      if (active) setForm({ ...initialSmtp, ...data.settings, port: String(data.settings.port), password: "" });
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load SMTP settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/email-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, port: Number(form.port) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save SMTP settings");
      setForm((current) => ({ ...current, password: "", passwordConfigured: true }));
      toast.success("SMTP settings saved securely");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save SMTP settings"); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await fetch("/api/email-settings", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "SMTP connection failed");
      toast.success("SMTP connection successful");
    } catch (error) { toast.error(error instanceof Error ? error.message : "SMTP connection failed"); }
    finally { setTesting(false); }
  }

  return <section className="rounded-xl border bg-white shadow-sm"><div className="flex items-start gap-3 border-b p-5"><div className="grid size-10 place-items-center rounded-lg bg-sky-100 text-sky-700"><Server className="size-5" /></div><div><h2 className="font-bold">SMTP email server</h2><p className="mt-1 text-sm text-slate-500">Used to send new-user and password-reset emails.</p></div></div><form onSubmit={save} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2 xl:col-span-2"><Label>SMTP host</Label><Input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="smtp.gmail.com" required /></div><div className="space-y-2"><Label>Port</Label><Input type="number" min={1} max={65535} value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} required /></div><div className="space-y-2"><Label>Security</Label><Select value={form.secure ? "tls" : "starttls"} onValueChange={(value) => setForm({ ...form, secure: value === "tls", port: value === "tls" ? "465" : "587" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tls">TLS · Port 465</SelectItem><SelectItem value="starttls">STARTTLS · Port 587</SelectItem></SelectContent></Select></div><div className="space-y-2 xl:col-span-2"><Label>SMTP username</Label><Input type="email" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="accounts@company.com" required /></div><div className="space-y-2 xl:col-span-2"><Label>SMTP password / app password</Label><Input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={form.passwordConfigured ? "Saved — leave blank to keep it" : "Enter password"} /></div><div className="space-y-2 xl:col-span-2"><Label>Sender name</Label><Input value={form.fromName} onChange={(event) => setForm({ ...form, fromName: event.target.value })} required /></div><div className="space-y-2 xl:col-span-2"><Label>Sender email</Label><Input type="email" value={form.fromEmail} onChange={(event) => setForm({ ...form, fromEmail: event.target.value })} required /></div><div className="flex flex-wrap justify-end gap-2 md:col-span-2 xl:col-span-4"><Button type="button" variant="outline" disabled={loading || testing || !form.passwordConfigured} onClick={testConnection}><Mail className="size-4" />{testing ? "Testing…" : "Test connection"}</Button><Button type="submit" disabled={loading || saving}><Send className="size-4" />{saving ? "Saving…" : "Save SMTP settings"}</Button></div><p className="text-xs leading-5 text-slate-500 md:col-span-2 xl:col-span-4">For Gmail, enable two-step verification and use a Google app password—not your normal Gmail password. The saved secret is encrypted and never shown again.</p></form></section>;
}
