"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy, KeyRound, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Role = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type ManagedUser = { id: number; fullName: string; email: string; role: Role; active: boolean; mustChangePassword: boolean; isCurrent: boolean };

const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "admin", label: "Administrator", description: "Full access, settings and user management" },
  { value: "accountant", label: "Accountant", description: "Accounting, sales, purchases, banking and reports" },
  { value: "sales", label: "Sales", description: "Customers, invoices, receipts and stock viewing" },
  { value: "purchasing", label: "Purchasing", description: "Vendors, bills, payments and stock viewing" },
  { value: "inventory", label: "Inventory Manager", description: "Items, specifications and stock transfers" },
  { value: "viewer", label: "Viewer", description: "Read-only dashboards, inventory and reports" },
];
const generatePassword = () => `CN-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}!`;

export function UserRoleCenter() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");

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
    fetch("/api/admin-users", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load users");
        if (active) setUsers(data.users);
      })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load users"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, email, role, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add user");
      const credentials = { email: email.trim().toLowerCase(), password };
      setCreateOpen(false); setCreatedCredentials(credentials); setFullName(""); setEmail(""); setRole("viewer"); setPassword("");
      await loadUsers(); toast.success("User added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add user"); }
  }

  async function updateUser(id: number, changes: Record<string, unknown>) {
    setSavingId(id);
    try {
      const response = await fetch("/api/admin-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update user");
      setUsers((current) => current.map((entry) => entry.id === id ? data.user : entry));
      toast.success("User access updated");
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update user"); return false; }
    finally { setSavingId(null); }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault(); if (!resetUser) return;
    const changed = await updateUser(resetUser.id, { password: resetPassword });
    if (changed) {
      setCreatedCredentials({ email: resetUser.email, password: resetPassword });
      setResetUser(null); setResetPassword("");
    }
  }

  async function copyCredentials(credentials: { email: string; password: string }) {
    try {
      await navigator.clipboard.writeText(`ComNet Accounting\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`);
      toast.success("Login details copied");
    } catch { toast.error("Could not copy. Select and copy the login details manually."); }
  }

  return <section className="rounded-xl border bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">Users & roles</h2><p className="mt-1 text-sm text-slate-500">Control access by job responsibility. Permissions are enforced by the server.</p></div><Button onClick={() => { setPassword(generatePassword()); setCreateOpen(true); }}><Plus className="size-4" />Add user</Button></div>
    <div className="grid gap-3 border-b bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-3">{roles.map((entry) => <div key={entry.value} className="rounded-lg border bg-white p-3"><p className="text-sm font-semibold text-slate-900">{entry.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{entry.description}</p></div>)}</div>
    <div className="divide-y">{loading ? <p className="p-5 text-sm text-slate-500">Loading users…</p> : users.map((user) => <div key={user.id} className="grid items-center gap-4 p-5 lg:grid-cols-[minmax(220px,1fr)_220px_130px_auto]">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{user.fullName || user.email}</p>{user.isCurrent && <Badge variant="outline">You</Badge>}{user.mustChangePassword && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Password change required</Badge>}</div><p className="mt-1 truncate text-sm text-slate-500">{user.email}</p></div>
      <Select value={user.role} disabled={user.isCurrent || savingId === user.id} onValueChange={(next) => updateUser(user.id, { role: next })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{roles.map((entry) => <SelectItem key={entry.value} value={entry.value}><span className="flex items-center gap-2"><ShieldCheck className="size-4" />{entry.label}</span></SelectItem>)}</SelectContent></Select>
      <Badge className={user.active ? "justify-center bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "justify-center bg-slate-100 text-slate-600 hover:bg-slate-100"}>{user.active ? "Active" : "Inactive"}</Badge>
      <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={user.isCurrent || savingId === user.id} onClick={() => { setResetUser(user); setResetPassword(generatePassword()); }}><KeyRound className="size-4" />Reset</Button><Button variant="outline" size="sm" disabled={user.isCurrent || savingId === user.id} onClick={() => updateUser(user.id, { active: !user.active })}>{user.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}{user.active ? "Deactivate" : "Activate"}</Button></div>
    </div>)}</div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Create a secure temporary login and assign the correct job role.</DialogDescription></DialogHeader><form onSubmit={createUser} className="space-y-4"><div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label>Role</Label><Select value={role} onValueChange={(value) => setRole(value as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">{roles.find((entry) => entry.value === role)?.description}</p></div><div className="space-y-2"><div className="flex items-center justify-between"><Label>Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setPassword(generatePassword())}>Generate</Button></div><Input value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit">Add user</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(resetUser)} onOpenChange={(open) => { if (!open) { setResetUser(null); setResetPassword(""); } }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a temporary password for {resetUser?.fullName || resetUser?.email}. Their active sessions will be signed out.</DialogDescription></DialogHeader><form onSubmit={submitReset} className="space-y-4"><div className="space-y-2"><div className="flex items-center justify-between"><Label>Temporary password</Label><Button type="button" variant="ghost" size="sm" onClick={() => setResetPassword(generatePassword())}>Generate</Button></div><Input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} maxLength={128} required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setResetUser(null)}>Cancel</Button><Button type="submit">Reset password</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(createdCredentials)} onOpenChange={(open) => { if (!open) setCreatedCredentials(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>User login created</DialogTitle><DialogDescription>Share these details securely. The user must create a new password at first login.</DialogDescription></DialogHeader>{createdCredentials && <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><div><p className="text-xs font-medium text-slate-500">Email</p><p className="mt-1 font-mono text-sm">{createdCredentials.email}</p></div><div><p className="text-xs font-medium text-slate-500">Temporary password</p><p className="mt-1 break-all font-mono text-sm">{createdCredentials.password}</p></div><Button type="button" variant="outline" className="w-full" onClick={() => copyCredentials(createdCredentials)}><Copy className="size-4" />Copy login details</Button></div>}<DialogFooter><Button onClick={() => setCreatedCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
