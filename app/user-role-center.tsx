"use client";

import { useEffect, useState } from "react";
import { Building2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRoleCenter as LegacyUserRoleCenter } from "./user-role-center-legacy";

type Role = "all_admin" | "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type Company = { id: number; name: string };
type User = { id: number; fullName: string; email: string; role: Role; companyIds: number[]; active: boolean; isCurrent: boolean };

const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "all_admin", label: "All-Admin", description: "Full access to every company" },
  { value: "admin", label: "Administrator", description: "Full access to assigned companies" },
  { value: "accountant", label: "Accountant", description: "Accounting access in assigned companies" },
  { value: "sales", label: "Sales", description: "Sales access in assigned companies" },
  { value: "purchasing", label: "Purchasing", description: "Purchasing access in assigned companies" },
  { value: "inventory", label: "Inventory Manager", description: "Inventory access in assigned companies" },
  { value: "viewer", label: "Viewer", description: "Read-only access in assigned companies" },
];

export function UserRoleCenter() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const response = await fetch("/api/admin-users", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load role access");
        if (cancelled) return;
        setUsers(data.users ?? []);
        setCompanies(data.companies ?? []);
        setDirtyIds(new Set());
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load role access");
      }
    }

    void loadUsers();
    return () => { cancelled = true; };
  }, []);

  function editUser(id: number, changes: Partial<Pick<User, "role" | "companyIds">>) {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes } : user));
    setDirtyIds((current) => new Set(current).add(id));
  }

  async function saveUser(user: User) {
    if (user.role !== "all_admin" && user.companyIds.length === 0) {
      toast.error("Assign at least one company before saving.");
      return;
    }
    setSavingId(user.id);
    try {
      const response = await fetch("/api/admin-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, role: user.role, companyIds: user.role === "all_admin" ? [] : user.companyIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update access");
      setUsers((current) => current.map((entry) => entry.id === user.id ? data.user : entry));
      setDirtyIds((current) => { const next = new Set(current); next.delete(user.id); return next; });
      toast.success("User role and company access saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update access"); }
    finally { setSavingId(null); }
  }

  async function deleteUser(user: User) {
    if (user.isCurrent) return;
    const confirmed = window.confirm(`Delete ${user.fullName || user.email}? This user will no longer be able to sign in. This action cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(user.id);
    try {
      const response = await fetch("/api/admin-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete user");
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setDirtyIds((current) => { const next = new Set(current); next.delete(user.id); return next; });
      toast.success("User deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete user"); }
    finally { setDeletingId(null); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b p-5">
        <div className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Building2 className="size-5" /></div>
        <div><h2 className="font-bold">Company & role access</h2><p className="mt-1 text-sm text-slate-500">Assign every role to one or more companies. Make your changes, then click Save. Administrator stays company-level; All-Admin has full access to all companies.</p></div>
      </div>
      <div className="grid gap-3 border-b bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-4">{roles.map((role) => <div key={role.value} className="rounded-lg border bg-white p-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-slate-500" /><p className="text-sm font-semibold">{role.label}</p></div><p className="mt-1 text-xs text-slate-500">{role.description}</p></div>)}</div>
      <div className="divide-y">{users.map((user) => <div key={user.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1fr)_220px_minmax(320px,1.5fr)_190px] lg:items-end">
        <div className="lg:self-start"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{user.fullName || user.email}</p>{user.isCurrent ? <Badge variant="outline">You</Badge> : null}{dirtyIds.has(user.id) ? <Badge variant="secondary">Unsaved</Badge> : null}</div><p className="mt-1 text-sm text-slate-500">{user.email}</p></div>
        <div><p className="mb-2 text-xs font-medium text-slate-500">Role</p><Select value={user.role} disabled={savingId === user.id || deletingId === user.id || user.isCurrent} onValueChange={(role) => editUser(user.id, { role: role as Role, companyIds: role === "all_admin" ? [] : user.companyIds })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select></div>
        <div><p className="mb-2 text-xs font-medium text-slate-500">Companies</p>{user.role === "all_admin" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">All companies · full access</div> : <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{companies.map((company) => <label key={company.id} className="flex items-center gap-2 text-sm"><Checkbox checked={user.companyIds.includes(company.id)} disabled={savingId === user.id || deletingId === user.id || user.isCurrent} onCheckedChange={(checked) => { const next = checked === true ? [...new Set([...user.companyIds, company.id])] : user.companyIds.filter((id) => id !== company.id); editUser(user.id, { companyIds: next }); }} />{company.name}</label>)}</div>}</div>
        <div className="flex gap-2"><Button className="flex-1" disabled={savingId === user.id || deletingId === user.id || user.isCurrent || !dirtyIds.has(user.id)} onClick={() => void saveUser(user)}><Save className="mr-2 size-4" />{savingId === user.id ? "Saving..." : "Save"}</Button><Button variant="outline" size="icon" title={user.isCurrent ? "You cannot delete your own account" : "Delete user"} disabled={savingId === user.id || deletingId === user.id || user.isCurrent} onClick={() => void deleteUser(user)} aria-label="Delete"><Trash2 className="size-4" /></Button></div>
      </div>)}</div>
    </section>
    <LegacyUserRoleCenter />
  </div>;
}
