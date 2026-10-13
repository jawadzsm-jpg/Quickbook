"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Camera, Clock, Copy, KeyRound, MailWarning, MapPin, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Send, ShieldCheck, Smartphone, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_IDLE_TIMEOUT_MINUTES, idleTimeoutChoices, idleTimeoutLabel } from "@/lib/idle-timeout";

type Role = "all_admin" | "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "customization" | "viewer";
type Company = { id: number; name: string };
type ManagedUser = {
  id: number; fullName: string; email: string; phone: string; whatsapp: string; avatarData: string; role: Role; companyIds: number[];
  active: boolean; mustChangePassword: boolean; idleTimeoutMinutes: number; lastLoginAt: string | null; lastLoginIp: string; lastLoginUserAgent: string; isCurrent: boolean; manageable: boolean;
};
type Draft = { role: Role; companyIds: number[] };
export type UserSummary = { total: number; active: number; inactive: number; pendingPassword: number };
type StatusFilter = "all" | "active" | "inactive" | "pending";

const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "all_admin", label: "All-Admin", description: "Full access to every company and all administration controls" },
  { value: "admin", label: "Administrator", description: "Full access, settings and user management in assigned companies" },
  { value: "accountant", label: "Accountant", description: "Accounting, sales, purchases, banking and reports" },
  { value: "sales", label: "Sales", description: "Own sales workspace, customers, invoices and stock viewing" },
  { value: "purchasing", label: "Purchasing", description: "Vendors, bills, payments and stock viewing" },
  { value: "inventory", label: "Inventory Manager", description: "Items, specifications and stock transfers" },
  { value: "customization", label: "Product Customization", description: "RAM, storage, part numbers, serials, UPCs and product details" },
  { value: "viewer", label: "Viewer", description: "Read-only dashboards, inventory and reports" },
];
const roleLabel = (role: Role) => roles.find((entry) => entry.value === role)?.label ?? role;
const generatePassword = () => `CN-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}!`;
const uaeTime = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "Never signed in";
const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);

function UserAvatar({ user, size = "size-11" }: { user: Pick<ManagedUser, "avatarData" | "fullName" | "email">; size?: string }) {
  return user.avatarData ? <Image src={user.avatarData} alt={`${user.fullName || user.email} profile`} width={44} height={44} unoptimized className={`${size} shrink-0 rounded-full border object-cover`} /> : <div className={`grid ${size} shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary`}>{(user.fullName || user.email).slice(0, 2).toUpperCase()}</div>;
}

function deviceName(userAgent: string) {
  if (!userAgent) return "No device recorded";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/") ? "Safari" : userAgent.includes("Firefox/") ? "Firefox" : "Browser";
  const device = /iPhone|iPad/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : /Macintosh/.test(userAgent) ? "macOS" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : "Device";
  return `${browser} on ${device}`;
}

function readPhoto(event: ChangeEvent<HTMLInputElement>, onLoad: (data: string) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 800_000) {
    event.target.value = "";
    return toast.error("Use a PNG, JPEG or WebP picture smaller than 800 KB.");
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result ?? ""));
  reader.onerror = () => toast.error("Could not read the selected picture.");
  reader.readAsDataURL(file);
}

// Automatic sign-out after inactivity; saving it keeps the user signed in and applies from their next activity.
function IdleTimeoutSelect({ id, value, disabled, onChange }: { id?: string; value: number; disabled?: boolean; onChange: (minutes: number) => void }) {
  return <Select value={String(value)} disabled={disabled} onValueChange={(next) => onChange(Number(next))}><SelectTrigger id={id} className="w-full"><Clock className="size-4 text-muted-foreground" /><SelectValue /></SelectTrigger><SelectContent>{idleTimeoutChoices.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `After ${idleTimeoutLabel(minutes)}` : "Never"}</SelectItem>)}</SelectContent></Select>;
}

function CompanyPicker({ companies, value, disabled, onChange }: { companies: Company[]; value: number[]; disabled?: boolean; onChange: (ids: number[]) => void }) {
  if (!companies.length) return <p className="text-sm text-muted-foreground">No active companies available. Add a company in Companies first.</p>;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{value.length} of {companies.length} selected</span><span className="flex gap-1"><Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={disabled || value.length === companies.length} onClick={() => onChange(companies.map((company) => company.id))}>Select all</Button><Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={disabled || !value.length} onClick={() => onChange([])}>Clear</Button></span></div>
    <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-1 overflow-y-auto rounded-lg border p-2">{companies.map((company) => <label key={company.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"><Checkbox checked={value.includes(company.id)} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true ? [...new Set([...value, company.id])] : value.filter((id) => id !== company.id))} /><span className="truncate" title={company.name}>{company.name}</span></label>)}</div>
  </div>;
}

export function UserRoleCenter({ onSummary }: { onSummary?: (summary: UserSummary) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [profileUser, setProfileUser] = useState<ManagedUser | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ userId: number; email: string; password: string; title: string; emailWarning?: string } | null>(null);
  const [resending, setResending] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: "", email: "", phone: "", whatsapp: "", avatarData: "", role: "viewer" as Role, companyIds: [] as number[], idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES, password: "", sendEmail: true });
  const [resetPassword, setResetPassword] = useState("");
  const [emailReset, setEmailReset] = useState(true);
  const [profile, setProfile] = useState({ fullName: "", phone: "", whatsapp: "", avatarData: "" });

  const fetchUsers = useCallback(async () => {
    const response = await fetch("/api/admin-users", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load users");
    return { users: (data.users ?? []) as ManagedUser[], companies: (data.companies ?? []) as Company[] };
  }, []);
  const applyUsers = useCallback((data: { users: ManagedUser[]; companies: Company[] }) => { setUsers(data.users); setCompanies(data.companies); setDrafts({}); }, []);

  async function loadUsers() {
    setLoading(true);
    try { applyUsers(await fetchUsers()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load users"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetchUsers().then((data) => { if (active) applyUsers(data); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load users"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchUsers, applyUsers]);

  const summary = useMemo<UserSummary>(() => ({ total: users.length, active: users.filter((user) => user.active).length, inactive: users.filter((user) => !user.active).length, pendingPassword: users.filter((user) => user.active && user.mustChangePassword).length }), [users]);
  useEffect(() => { if (!loading) onSummary?.(summary); }, [loading, summary, onSummary]);

  const currentRole = users.find((user) => user.isCurrent)?.role;
  const canManageAllAdmin = currentRole === "all_admin";
  // Company Administrators add and manage operational users of their own companies only; the API enforces the same rule.
  const assignableRole = (role: Role) => canManageAllAdmin || (role !== "all_admin" && role !== "admin");
  const dirtyCount = Object.keys(drafts).length;

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const role = drafts[user.id]?.role ?? user.role;
      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (statusFilter === "active" && !user.active) return false;
      if (statusFilter === "inactive" && user.active) return false;
      if (statusFilter === "pending" && !(user.active && user.mustChangePassword)) return false;
      return !needle || [user.fullName, user.email, user.phone, user.whatsapp, roleLabel(role)].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [users, drafts, query, roleFilter, statusFilter]);

  function editDraft(user: ManagedUser, changes: Partial<Draft>) {
    setDrafts((current) => {
      const next: Draft = { role: current[user.id]?.role ?? user.role, companyIds: current[user.id]?.companyIds ?? user.companyIds, ...changes };
      if (next.role === "all_admin") next.companyIds = [];
      const copy = { ...current };
      if (next.role === user.role && sameIds(next.companyIds, user.companyIds)) delete copy[user.id]; else copy[user.id] = next;
      return copy;
    });
  }

  function discardDraft(id: number) { setDrafts((current) => { const copy = { ...current }; delete copy[id]; return copy; }); }

  async function patchUser(id: number, changes: Record<string, unknown>, success: string) {
    setBusyId(id);
    try {
      const response = await fetch("/api/admin-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update user");
      setUsers((current) => current.map((entry) => entry.id === id ? data.user : entry));
      discardDraft(id);
      if (data.emailWarning) toast.warning(`${success}. Email not sent: ${data.emailWarning}`); else toast.success(data.emailSent ? `${success} and email sent` : success);
      return data as { emailSent?: boolean; emailWarning?: string };
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update user"); return null; }
    finally { setBusyId(null); }
  }

  async function saveAccess(user: ManagedUser) {
    const draft = drafts[user.id];
    if (!draft) return;
    if (draft.role !== "all_admin" && !draft.companyIds.length) return toast.error("Assign at least one company before saving.");
    await patchUser(user.id, { role: draft.role, companyIds: draft.companyIds }, `${user.fullName || user.email}: access saved`);
  }

  async function saveAllAccess() {
    for (const user of users) {
      const draft = drafts[user.id];
      if (draft && draft.role !== "all_admin" && !draft.companyIds.length) return toast.error(`Assign at least one company to ${user.fullName || user.email}.`);
    }
    for (const user of users) if (drafts[user.id]) await saveAccess(user);
  }

  async function toggleActive(user: ManagedUser) {
    if (user.active && !window.confirm(`Deactivate ${user.fullName || user.email}? They are signed out immediately and cannot sign in until reactivated.`)) return;
    await patchUser(user.id, { active: !user.active }, user.active ? "User deactivated" : "User activated");
  }

  async function deleteUser(user: ManagedUser) {
    if (user.isCurrent) return;
    if (!window.confirm(`Delete ${user.fullName || user.email}? This user will no longer be able to sign in. This action cannot be undone. Tip: Deactivate keeps the account for later.`)) return;
    setBusyId(user.id);
    try {
      const response = await fetch("/api/admin-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete user");
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      discardDraft(user.id);
      toast.success("User deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete user"); }
    finally { setBusyId(null); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (newUser.role !== "all_admin" && !newUser.companyIds.length) return toast.error("Select at least one company for this user.");
    setCreating(true);
    try {
      const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newUser, companyIds: newUser.role === "all_admin" ? [] : newUser.companyIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add user");
      setCreateOpen(false);
      setCreatedCredentials({ userId: data.user.id, email: newUser.email.trim().toLowerCase(), password: newUser.password, title: "User login created", emailWarning: data.emailWarning || "" });
      setUsers((current) => [...current, data.user].sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email)));
      if (data.emailWarning) toast.warning(`User added. Email not sent: ${data.emailWarning}`); else toast.success(data.emailSent ? "User added and login email sent" : "User added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add user"); }
    finally { setCreating(false); }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault(); if (!resetUser) return;
    const changed = await patchUser(resetUser.id, { password: resetPassword, sendEmail: emailReset }, "Password reset");
    if (changed) { setCreatedCredentials({ userId: resetUser.id, email: resetUser.email, password: resetPassword, title: "Temporary password set", emailWarning: changed.emailWarning || "" }); setResetUser(null); setResetPassword(""); }
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault(); if (!profileUser) return;
    if (await patchUser(profileUser.id, profile, "Profile saved")) setProfileUser(null);
  }

  // Send email again: re-sends the login email with the same temporary password (for example after a provider limit resets).
  async function resendCredentials() {
    if (!createdCredentials || resending) return;
    setResending(true);
    try {
      const response = await fetch("/api/admin-users/resend-invitation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: createdCredentials.userId, password: createdCredentials.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send the email.");
      setCreatedCredentials((current) => current ? { ...current, emailWarning: data.emailWarning || "" } : current);
      if (data.emailSent) toast.success(`Login email sent to ${createdCredentials.email}`); else toast.warning(`Email not sent: ${data.emailWarning}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send the email."); }
    finally { setResending(false); }
  }

  async function copyCredentials(credentials: { email: string; password: string }) {
    try {
      await navigator.clipboard.writeText(`ComNet Accounting\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`);
      toast.success("Login details copied");
    } catch { toast.error("Could not copy. Select and copy the login details manually."); }
  }

  function openCreate() {
    setNewUser({ fullName: "", email: "", phone: "", whatsapp: "", avatarData: "", role: "viewer", companyIds: companies.length === 1 ? [companies[0].id] : [], idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES, password: generatePassword(), sendEmail: true });
    setCreateOpen(true);
  }

  const roleOptions = (selected: Role) => roles.filter((role) => assignableRole(role.value) || selected === role.value);

  return <section className="min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Users and access">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b p-4 sm:p-5">
      <div className="min-w-0 flex-1 basis-80"><h2 className="text-lg font-semibold">Users & access</h2><p className="mt-1 text-sm text-muted-foreground">Add staff, choose their role and companies, and manage sign-in. Role and company changes sign the user out so the new access applies immediately. Auto sign-out ends a session after the chosen time without activity (15 minutes by default).{currentRole && !canManageAllAdmin ? " As a company Administrator you can add and manage non-administrator users of your companies; an All-Admin manages Administrators." : ""}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => { if (dirtyCount && !window.confirm("Discard unsaved access changes and reload?")) return; void loadUsers(); }}><RefreshCw className="size-4" />Refresh</Button><Button type="button" onClick={openCreate}><Plus className="size-4" />Add user</Button></div>
    </header>

    <div className="space-y-3 border-b bg-muted/30 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2 text-xs">{([["all", `All ${summary.total}`], ["active", `Active ${summary.active}`], ["inactive", `Inactive ${summary.inactive}`], ["pending", `Password change pending ${summary.pendingPassword}`]] as Array<[StatusFilter, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${statusFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{label}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search users" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or role" className="bg-background pl-9" /></div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as Role | "all")}><SelectTrigger aria-label="Filter by role" className="w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{roles.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-medium text-muted-foreground">What can each role do?</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{roles.map((role) => <div key={role.value} className="rounded-lg border bg-background p-3"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-muted-foreground" />{role.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{role.description}</p></div>)}</div></details>
    </div>

    {dirtyCount > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm sm:px-5"><span className="font-medium">{dirtyCount} user{dirtyCount === 1 ? "" : "s"} with unsaved access changes</span><span className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busyId !== null} onClick={() => setDrafts({})}><RotateCcw className="size-4" />Discard all</Button><Button type="button" size="sm" disabled={busyId !== null} onClick={() => void saveAllAccess()}><Save className="size-4" />Save all</Button></span></div>}

    <div className="divide-y">{loading ? <p role="status" className="p-5 text-sm text-muted-foreground">Loading users…</p> : !visibleUsers.length ? <p className="p-8 text-center text-sm text-muted-foreground">{users.length ? "No users match these filters." : "No users yet. Click Add user to invite your first staff member."}</p> : visibleUsers.map((user) => {
      const draft = drafts[user.id];
      const role = draft?.role ?? user.role;
      const companyIds = draft?.companyIds ?? user.companyIds;
      const busy = busyId === user.id;
      const locked = !user.manageable;
      const accessLocked = busy || user.isCurrent || locked;
      return <article key={user.id} className={`grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(240px,1fr)_minmax(320px,1.4fr)_auto] ${user.active ? "" : "bg-muted/30"}`}>
        <div className="flex min-w-0 gap-3">
          <UserAvatar user={user} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5"><p className="truncate font-semibold">{user.fullName || user.email}</p>{user.isCurrent && <Badge variant="outline">You</Badge>}<Badge variant="secondary" className={user.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}>{user.active ? "Active" : "Inactive"}</Badge>{user.active && user.mustChangePassword && <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-300">Password change required</Badge>}{draft && <Badge variant="secondary">Unsaved</Badge>}</div>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            {(user.phone || user.whatsapp) && <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">{user.phone && <span>{user.phone}</span>}{user.whatsapp && <span>WhatsApp: {user.whatsapp}</span>}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground"><span title="Last sign-in (UAE time)">{uaeTime(user.lastLoginAt)}</span>{user.lastLoginIp && <span className="flex items-center gap-1"><MapPin className="size-3" />{user.lastLoginIp}</span>}{user.lastLoginUserAgent && <span className="flex items-center gap-1"><Smartphone className="size-3" />{deviceName(user.lastLoginUserAgent)}</span>}</div>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[200px_1fr]">
          <div><Label className="mb-1.5 text-xs text-muted-foreground">Role</Label><Select value={role} disabled={accessLocked} onValueChange={(next) => editDraft(user, { role: next as Role })}><SelectTrigger aria-label={`Role for ${user.fullName || user.email}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{roleOptions(role).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select>{user.isCurrent && <p className="mt-1 text-xs text-muted-foreground">You cannot change your own access.</p>}<Label htmlFor={`idle-timeout-${user.id}`} className="mb-1.5 mt-3 text-xs text-muted-foreground">Auto sign-out when idle</Label><IdleTimeoutSelect id={`idle-timeout-${user.id}`} value={user.idleTimeoutMinutes} disabled={busy || locked} onChange={(minutes) => void patchUser(user.id, { idleTimeoutMinutes: minutes }, `${user.fullName || user.email}: auto sign-out ${minutes ? `after ${idleTimeoutLabel(minutes)}` : "turned off"}`)} /></div>
          <div className="min-w-0"><Label className="mb-1.5 text-xs text-muted-foreground">Companies</Label>{role === "all_admin" ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">All companies · full access</p> : <CompanyPicker companies={companies} value={companyIds} disabled={accessLocked} onChange={(ids) => editDraft(user, { companyIds: ids })} />}</div>
        </div>
        <div className="flex flex-wrap content-start gap-2 xl:w-44 xl:flex-col">
          {draft && <><Button type="button" size="sm" disabled={busy} onClick={() => void saveAccess(user)}><Save className="size-4" />{busy ? "Saving…" : "Save access"}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => discardDraft(user.id)}><RotateCcw className="size-4" />Discard</Button></>}
          <Button type="button" size="sm" variant="outline" disabled={busy || locked} onClick={() => { setProfile({ fullName: user.fullName, phone: user.phone, whatsapp: user.whatsapp, avatarData: user.avatarData }); setProfileUser(user); }}><Pencil className="size-4" />Edit profile</Button>
          <Button type="button" size="sm" variant="outline" disabled={accessLocked} onClick={() => { setResetUser(user); setResetPassword(generatePassword()); setEmailReset(true); }}><KeyRound className="size-4" />Reset password</Button>
          <Button type="button" size="sm" variant="outline" disabled={accessLocked} onClick={() => void toggleActive(user)}>{user.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}{user.active ? "Deactivate" : "Activate"}</Button>
          <Button type="button" size="sm" variant="outline" className="text-destructive" title={user.isCurrent ? "You cannot delete your own account" : "Delete user"} disabled={accessLocked} onClick={() => void deleteUser(user)}><Trash2 className="size-4" />Delete</Button>
        </div>
      </article>;
    })}</div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Create the profile, choose access and set a secure temporary login. The user must choose a new password at first sign-in.</DialogDescription></DialogHeader><form onSubmit={createUser} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-user-name">Full name</Label><Input id="new-user-name" value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} required maxLength={120} /></div><div className="space-y-2"><Label htmlFor="new-user-email">Email</Label><Input id="new-user-email" type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="new-user-phone">Phone</Label><Input id="new-user-phone" type="tel" value={newUser.phone} onChange={(event) => setNewUser({ ...newUser, phone: event.target.value })} placeholder="+971…" maxLength={32} /></div><div className="space-y-2"><Label htmlFor="new-user-whatsapp">WhatsApp</Label><Input id="new-user-whatsapp" type="tel" value={newUser.whatsapp} onChange={(event) => setNewUser({ ...newUser, whatsapp: event.target.value })} placeholder="+971…" maxLength={32} /></div><div className="space-y-2 sm:col-span-2"><Label>Role</Label><Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value as Role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roleOptions(newUser.role).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{roleLabel(newUser.role)} · {roles.find((entry) => entry.value === newUser.role)?.description}</p></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="new-user-idle-timeout">Auto sign-out when idle</Label><IdleTimeoutSelect id="new-user-idle-timeout" value={newUser.idleTimeoutMinutes} disabled={creating} onChange={(minutes) => setNewUser({ ...newUser, idleTimeoutMinutes: minutes })} /><p className="text-xs text-muted-foreground">Signs the user out after this long without using the keyboard, mouse or screen. You can change it later.</p></div></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Companies{newUser.role !== "all_admin" ? " *" : ""}</legend>{newUser.role === "all_admin" ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">All-Admin has full access to every company.</p> : <CompanyPicker companies={companies} value={newUser.companyIds} disabled={creating} onChange={(ids) => setNewUser({ ...newUser, companyIds: ids })} />}</fieldset>
      <div className="rounded-xl border bg-muted/30 p-4"><div className="flex flex-wrap items-center gap-4">{newUser.avatarData ? <Image src={newUser.avatarData} alt="Selected profile preview" width={80} height={80} unoptimized className="size-20 rounded-full border object-cover" /> : <div className="grid size-20 place-items-center rounded-full border-2 border-dashed bg-background text-muted-foreground"><Camera className="size-6" /></div>}<div className="space-y-2"><Label htmlFor="user-photo">User picture</Label><Input id="user-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readPhoto(event, (avatarData) => setNewUser((current) => ({ ...current, avatarData })))} className="max-w-sm bg-background" /><p className="text-xs text-muted-foreground">Optional · PNG, JPEG or WebP · maximum 800 KB</p></div></div></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="new-user-password">Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setNewUser({ ...newUser, password: generatePassword() })}>Generate</Button></div><Input id="new-user-password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} minLength={12} maxLength={128} required /><p className="text-xs text-muted-foreground">At least 12 characters. You can copy it after the user is created.</p></div>
      <label className="flex items-start gap-3 rounded-lg border p-3"><Checkbox checked={newUser.sendEmail} onCheckedChange={(checked) => setNewUser({ ...newUser, sendEmail: checked === true })} /><span><span className="block text-sm font-medium">Email login details</span><span className="block text-xs text-muted-foreground">Send the role, login link and temporary password using the Email server settings.</span></span></label>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={creating || (newUser.role !== "all_admin" && !newUser.companyIds.length)}>{creating ? "Adding…" : newUser.sendEmail ? "Add user & send email" : "Add user"}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    <Dialog open={Boolean(profileUser)} onOpenChange={(open) => { if (!open) setProfileUser(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Edit profile</DialogTitle><DialogDescription>{profileUser?.email} · Profile changes do not sign the user out.</DialogDescription></DialogHeader><form onSubmit={submitProfile} className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">{profile.avatarData ? <Image src={profile.avatarData} alt="Profile preview" width={64} height={64} unoptimized className="size-16 rounded-full border object-cover" /> : <div className="grid size-16 place-items-center rounded-full border-2 border-dashed text-muted-foreground"><Camera className="size-5" /></div>}<div className="flex flex-wrap gap-2"><Input aria-label="Profile picture" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readPhoto(event, (avatarData) => setProfile((current) => ({ ...current, avatarData })))} className="max-w-56" />{profile.avatarData && <Button type="button" variant="ghost" size="sm" onClick={() => setProfile({ ...profile, avatarData: "" })}>Remove picture</Button>}</div></div>
      <div className="space-y-2"><Label htmlFor="profile-name">Full name</Label><Input id="profile-name" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required maxLength={120} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="profile-phone">Phone</Label><Input id="profile-phone" type="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} maxLength={32} /></div><div className="space-y-2"><Label htmlFor="profile-whatsapp">WhatsApp</Label><Input id="profile-whatsapp" type="tel" value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} maxLength={32} /></div></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setProfileUser(null)}>Cancel</Button><Button type="submit" disabled={busyId === profileUser?.id}>{busyId === profileUser?.id ? "Saving…" : "Save profile"}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    <Dialog open={Boolean(resetUser)} onOpenChange={(open) => { if (!open) { setResetUser(null); setResetPassword(""); } }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a temporary password for {resetUser?.fullName || resetUser?.email}. Active sessions are signed out and a new password is required at next sign-in.</DialogDescription></DialogHeader><form onSubmit={submitReset} className="space-y-4"><div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="reset-password">Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setResetPassword(generatePassword())}>Generate</Button></div><Input id="reset-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} maxLength={128} required /></div><label className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={emailReset} onCheckedChange={(checked) => setEmailReset(checked === true)} /><span className="text-sm font-medium">Email the new temporary password</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => setResetUser(null)}>Cancel</Button><Button type="submit" disabled={busyId === resetUser?.id}>Reset password</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(createdCredentials)} onOpenChange={(open) => { if (!open) setCreatedCredentials(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{createdCredentials?.title}</DialogTitle><DialogDescription>The user must create a new password at first sign-in. This password is not shown again.</DialogDescription></DialogHeader>{createdCredentials ? <div className="space-y-3 rounded-xl border bg-muted/30 p-4"><div><p className="text-xs font-medium text-muted-foreground">Email</p><p className="mt-1 font-mono text-sm">{createdCredentials.email}</p></div><div><p className="text-xs font-medium text-muted-foreground">Temporary password</p><p className="mt-1 break-all font-mono text-sm">{createdCredentials.password}</p></div><Button type="button" variant="outline" className="w-full" onClick={() => void copyCredentials(createdCredentials)}><Copy className="size-4" />Copy login details</Button></div> : null}{createdCredentials?.emailWarning ? <div role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"><p className="flex gap-2"><MailWarning className="mt-0.5 size-4 shrink-0" /><span><strong>Email not sent.</strong> {createdCredentials.emailWarning}</span></p><Button type="button" variant="outline" className="w-full bg-white dark:bg-transparent" disabled={resending} onClick={() => void resendCredentials()}><Send className="size-4" />{resending ? "Sending…" : "Send email again"}</Button></div> : null}<DialogFooter><Button onClick={() => setCreatedCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
