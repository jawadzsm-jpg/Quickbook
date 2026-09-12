"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Invoice = { id: number; number: string; transactionDate: string; dueDate: string | null; status: string; total: number; paid: number; remaining: number };

export function UnpaidInvoices({ companyId, locationId, party, currency, paymentId, selectedInvoiceIds, onSelect }: { companyId: number; locationId: number; party: string; currency: string; paymentId?: string; selectedInvoiceIds: number[]; onSelect: (invoices: Invoice[]) => void }) {
  const [result, setResult] = useState<{ records?: Invoice[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const ready = Boolean(companyId && locationId && party && currency);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: "unpaid-invoices", companyId: String(companyId), locationId: String(locationId), party, currency, paymentId: paymentId || "" });
    async function load() {
      try {
        const response = await fetch(`/api/records?${params}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load unpaid invoices.");
        if (!controller.signal.aborted) setResult({ records: data.records });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : "Could not load unpaid invoices." });
      }
    }
    void load();
    return () => controller.abort();
  }, [companyId, locationId, party, currency, paymentId, ready, attempt]);
  const money = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(value);

  return <section className="overflow-hidden rounded-xl border bg-slate-50" aria-label="Unpaid invoices">
    <div className="border-b p-4"><h3 className="font-semibold">Unpaid invoices</h3><p className="mt-1 text-xs text-slate-500">Select invoices to fill their combined remaining balance. A smaller payment is applied to the oldest selected invoice first. Earlier payments without an invoice link are not deducted here.</p></div>
    {selectedInvoiceIds.length > 0 && <div className="px-4 pt-3"><Button type="button" size="sm" variant="outline" onClick={() => onSelect([])}>Clear invoice selection</Button></div>}
    <div aria-live="polite">
      {!ready ? <p className="p-4 text-sm text-slate-500">Select a customer, inventory and currency to see unpaid invoices.</p> : result.error ? <div className="flex items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-rose-600">{result.error}</p><Button type="button" variant="outline" onClick={() => { setResult({}); setAttempt((value) => value + 1); }}>Retry</Button></div> : !result.records ? <p className="p-4 text-sm text-slate-500">Loading unpaid invoices…</p> : !result.records.length ? <p className="p-4 text-sm text-slate-500">No invoices marked unpaid for this customer, inventory and currency.</p> : <>
        <div className="flex items-center justify-between p-4 text-sm"><Button type="button" size="sm" variant="outline" onClick={() => onSelect(result.records!)}>Select all</Button><span>{selectedInvoiceIds.length} selected · {money(result.records.filter((invoice) => selectedInvoiceIds.includes(invoice.id)).reduce((sum, invoice) => sum + invoice.remaining, 0))}</span></div><div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Invoice reference</TableHead><TableHead>Invoice date</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Invoice total ({currency})</TableHead><TableHead className="text-right">Remaining ({currency})</TableHead></TableRow></TableHeader><TableBody>{result.records.map((invoice) => <TableRow key={invoice.id} data-state={selectedInvoiceIds.includes(invoice.id) ? "selected" : undefined}><TableCell><input type="checkbox" aria-label={`Select invoice ${invoice.number}`} checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => onSelect(result.records!.filter((entry) => entry.id === invoice.id ? !selectedInvoiceIds.includes(entry.id) : selectedInvoiceIds.includes(entry.id)))} className="size-4 accent-emerald-600" /></TableCell><TableCell className="font-medium">{invoice.number}</TableCell><TableCell>{invoice.transactionDate}</TableCell><TableCell>{invoice.dueDate || "—"}</TableCell><TableCell className="capitalize">{invoice.status}</TableCell><TableCell className="text-right">{money(invoice.total)}</TableCell><TableCell className="text-right font-semibold">{money(invoice.remaining)}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex justify-between border-t p-4 text-sm font-semibold"><span>{result.records.length} unpaid {result.records.length === 1 ? "invoice" : "invoices"} · Remaining total</span><span>{money(result.records.reduce((sum, invoice) => sum + invoice.remaining, 0))}</span></div>
      </>}
    </div>
  </section>;
}
