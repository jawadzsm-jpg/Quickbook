"use client";

import { useEffect, useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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

  async function load() {
    try {
      const response = await fetch("/api/admin-users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load role access");
      setUsers(data.users ?? []); setCompanies(data.companies ?? []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load role access"); }
  }

  useEffect(() => { void load(); }, []);

  async function updateUser(user: User, changes: Record<string, unknown>) {
    setSavingId(user.id);
    try {
      const response = await fetch("/api/admin-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, ...changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update access");
      setUsers((current) => current.map((entry) => entry.id === user.id ? data.user : entry));
      toast.success("User company access updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update access"); }
    finally { setSavingId(null); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b p-5">
        <div className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Building2 className="size-5" /></div>
        <div><h2 className="font-bold">Company & role access</h2><p className="mt-1 text-sm text-slate-500">Assign every role to one or more companies. Administrator stays company-level; All-Admin has full access to all companies.</p></div>
      </div>
      <div className="grid gap-3 border-b bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-4">{roles.map((role) => <div key={role.value} className="rounded-lg border bg-white p-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-slate-500" /><p className="text-sm font-semibold">{role.label}</p></div><p className="mt-1 text-xs text-slate-500">{role.description}</p></div>)}</div>
      <div className="divide-y">{users.map((user) => <div key={user.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1fr)_220px_minmax(320px,1.5fr)]">
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{user.fullName || user.email}</p>{user.isCurrent ? <Badge variant="outline">You</Badge> : null}</div><p className="mt-1 text-sm text-slate-500">{user.email}</p></div>
        <div><p className="mb-2 text-xs font-medium text-slate-500">Role</p><Select value={user.role} disabled={savingId === user.id || user.isCurrent} onValueChange={(role) => updateUser(user, { role, companyIds: role === "all_admin" ? [] : user.companyIds })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select></div>
        <div><p className="mb-2 text-xs font-medium text-slate-500">Companies</p>{user.role === "all_admin" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">All companies · full access</div> : <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{companies.map((company) => <label key={company.id} className="flex items-center gap-2 text-sm"><Checkbox checked={user.companyIds.includes(company.id)} disabled={savingId === user.id || user.isCurrent} onCheckedChange={(checked) => { const next = checked === true ? [...new Set([...user.companyIds, company.id])] : user.companyIds.filter((id) => id !== company.id); if (next.length) void updateUser(user, { companyIds: next }); else toast.error("Assign at least one company."); }} />{company.name}</label>)}</div>}</div>
      </div>)}</div>
    </section>
    <LegacyUserRoleCenter />
  </div>;
}
