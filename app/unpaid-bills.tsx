"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Bill = { id: number; number: string; transactionDate: string; dueDate: string | null; status: string; total: number };

export function UnpaidBills({ companyId, locationId, party, currency }: { companyId: number; locationId: number; party: string; currency: string }) {
  const [result, setResult] = useState<{ records?: Bill[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const ready = Boolean(companyId && locationId && party && currency);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: "unpaid-bills", companyId: String(companyId), locationId: String(locationId), party, currency });
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
  }, [companyId, locationId, party, currency, ready, attempt]);
  const money = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(value);

  return <section className="overflow-hidden rounded-xl border bg-slate-50" aria-label="Unpaid bills">
    <div className="border-b p-4"><h3 className="font-semibold">Unpaid bills</h3><p className="mt-1 text-xs text-slate-500">Bills marked unpaid for the selected vendor, inventory and currency. Totals are original bill amounts; payments recorded against the vendor are not allocated to individual bills.</p></div>
    <div aria-live="polite">
      {!ready ? <p className="p-4 text-sm text-slate-500">Select a vendor, inventory and currency to see unpaid bills.</p> : result.error ? <div className="flex items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-rose-600">{result.error}</p><Button type="button" variant="outline" onClick={() => { setResult({}); setAttempt((value) => value + 1); }}>Retry</Button></div> : !result.records ? <p className="p-4 text-sm text-slate-500">Loading unpaid bills…</p> : !result.records.length ? <p className="p-4 text-sm text-slate-500">No bills marked unpaid for this vendor, inventory and currency.</p> : <>
        <div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>Bill reference</TableHead><TableHead>Bill date</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Bill total ({currency})</TableHead></TableRow></TableHeader><TableBody>{result.records.map((bill) => <TableRow key={bill.id}><TableCell className="font-medium">{bill.number}</TableCell><TableCell>{bill.transactionDate}</TableCell><TableCell>{bill.dueDate || "—"}</TableCell><TableCell className="capitalize">{bill.status}</TableCell><TableCell className="text-right">{money(bill.total)}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex justify-between border-t p-4 text-sm font-semibold"><span>{result.records.length} unpaid {result.records.length === 1 ? "bill" : "bills"} · Original total</span><span>{money(result.records.reduce((sum, bill) => sum + bill.total, 0))}</span></div>
      </>}
    </div>
  </section>;
}
