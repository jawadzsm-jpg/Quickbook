"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Bill = { id: number; number: string; transactionDate: string; dueDate: string | null; status: string; total: number; paid: number; remaining: number };

export function UnpaidBills({ companyId, locationId, party, currency, paymentId, selectedBillId, onSelect }: { companyId: number; locationId: number; party: string; currency: string; paymentId?: string; selectedBillId: string; onSelect: (bill: Bill | null) => void }) {
  const [result, setResult] = useState<{ records?: Bill[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const ready = Boolean(companyId && locationId && party && currency);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: "unpaid-bills", companyId: String(companyId), locationId: String(locationId), party, currency, paymentId: paymentId || "" });
    async function load() {
      try {
        const response = await fetch(`/api/records?${params}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load unpaid bills.");
        if (!controller.signal.aborted) setResult({ records: data.records });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : "Could not load unpaid bills." });
      }
    }
    void load();
    return () => controller.abort();
  }, [companyId, locationId, party, currency, paymentId, ready, attempt]);
  const money = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(value);

  return <section className="overflow-hidden rounded-xl border bg-slate-50" aria-label="Unpaid bills">
    <div className="border-b p-4"><h3 className="font-semibold">Unpaid bills</h3><p className="mt-1 text-xs text-slate-500">Select a bill to fill its remaining balance. You can enter a smaller amount for a partial payment. Earlier payments without a bill link are not deducted here.</p></div>
    {selectedBillId && <div className="px-4 pt-3"><Button type="button" size="sm" variant="outline" onClick={() => onSelect(null)}>Clear bill selection</Button></div>}
    <div aria-live="polite">
      {!ready ? <p className="p-4 text-sm text-slate-500">Select a vendor, inventory and currency to see unpaid bills.</p> : result.error ? <div className="flex items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-rose-600">{result.error}</p><Button type="button" variant="outline" onClick={() => { setResult({}); setAttempt((value) => value + 1); }}>Retry</Button></div> : !result.records ? <p className="p-4 text-sm text-slate-500">Loading unpaid bills…</p> : !result.records.length ? <p className="p-4 text-sm text-slate-500">No bills marked unpaid for this vendor, inventory and currency.</p> : <>
        <div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Bill reference</TableHead><TableHead>Bill date</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Bill total ({currency})</TableHead><TableHead className="text-right">Remaining ({currency})</TableHead></TableRow></TableHeader><TableBody>{result.records.map((bill) => <TableRow key={bill.id} data-state={selectedBillId === String(bill.id) ? "selected" : undefined}><TableCell><input type="radio" name="payment-bill" aria-label={`Select bill ${bill.number}`} checked={selectedBillId === String(bill.id)} onChange={() => onSelect(bill)} className="size-4 accent-emerald-600" /></TableCell><TableCell className="font-medium">{bill.number}</TableCell><TableCell>{bill.transactionDate}</TableCell><TableCell>{bill.dueDate || "—"}</TableCell><TableCell className="capitalize">{bill.status}</TableCell><TableCell className="text-right">{money(bill.total)}</TableCell><TableCell className="text-right font-semibold">{money(bill.remaining)}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex justify-between border-t p-4 text-sm font-semibold"><span>{result.records.length} unpaid {result.records.length === 1 ? "bill" : "bills"} · Remaining total</span><span>{money(result.records.reduce((sum, bill) => sum + bill.remaining, 0))}</span></div>
      </>}
    </div>
  </section>;
}
