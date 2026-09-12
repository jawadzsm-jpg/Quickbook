"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Rep = { id: number; name: string };

export function PaymentSalesRep({ companyId, currency, employees, value, onChange }: { companyId: number; currency: string; employees: Rep[]; value: string; onChange: (name: string) => void }) {
  const [added, setAdded] = useState<Rep[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const reps = [...employees, ...added.filter((rep) => !employees.some((employee) => employee.id === rep.id))];
  async function add() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const existing = reps.find((rep) => rep.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) { onChange(existing.name); setEditing(false); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "contacts", companyId, type: "employee", name: trimmed, currency, status: "active" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add sales rep.");
      setAdded((previous) => [...previous, { id: data.record.id, name: data.record.name }]);
      onChange(data.record.name); setName(""); setEditing(false);
      toast.success("Sales rep added to Employees & HR.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add sales rep."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-2"><Label htmlFor="payment-sales-rep">Sales Rep</Label>
    <Select value={value || "none"} onValueChange={(selected) => onChange(selected === "none" ? "" : selected)}><SelectTrigger id="payment-sales-rep" className="w-full"><SelectValue placeholder="Select sales rep" /></SelectTrigger><SelectContent><SelectItem value="none">No sales rep</SelectItem>{value && !reps.some((rep) => rep.name === value) && <SelectItem value={value}>{value}</SelectItem>}{reps.map((rep) => <SelectItem key={rep.id} value={rep.name}>{rep.name}</SelectItem>)}</SelectContent></Select>
    {editing ? <div className="space-y-2"><Input aria-label="New sales rep name" placeholder="Sales rep name" maxLength={200} value={name} disabled={saving} onChange={(event) => setName(event.target.value)} /><div className="flex gap-2"><Button type="button" size="sm" disabled={saving || !name.trim()} onClick={() => void add()}>{saving ? "Adding…" : "Add sales rep"}</Button><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></div><p className="text-xs text-slate-500">Creates an employee for this company. Administrator access required.</p></div> : <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEditing(true)}>+ Add sales rep</Button>}
  </div>;
}
