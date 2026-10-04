"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function CustomerSalesOwner({ companyId, customers, onSaved }: { companyId: number; customers: { id: number; name: string; salesOwnerId: number | null }[]; onSaved: () => void }) {
  const [reps, setReps] = useState<{ id: number; name: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; fetch(`/api/sales-work?companyId=${companyId}`).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (live) setReps(data.reps); }).catch(error => toast.error(error.message)); return () => { live = false; }; }, [companyId]);
  const customer = customers.find(row => row.id === Number(customerId));
  async function save() {
    if (!customer) return;
    setBusy(true);
    try { const response = await fetch("/api/sales-work", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, customerId: customer.id, salesOwnerId: ownerId ? Number(ownerId) : null, expectedOwnerId: customer.salesOwnerId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); toast.success("Sales customer assignment saved"); onSaved(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not assign customer."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-background p-4"><h2 className="font-semibold">Assign customer to sales user</h2><p className="text-sm text-muted-foreground">Unassigned customers are visible to administrators and accounting only. New sales-created customers are assigned automatically.</p><div className="grid items-end gap-3 sm:grid-cols-3"><label className="grid min-w-0 gap-1 text-sm">Customer<select className="h-10 w-full rounded-md border bg-background px-2" value={customerId} onChange={event => { setCustomerId(event.target.value); setOwnerId(String(customers.find(row => row.id === Number(event.target.value))?.salesOwnerId || "")); }}><option value="">Select customer</option>{customers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm">Sales user<select className="h-10 w-full rounded-md border bg-background px-2" value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">Unassigned</option>{reps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}</select></label><Button disabled={!customer || busy} onClick={() => void save()}>Save assignment</Button></div></section>;
}
