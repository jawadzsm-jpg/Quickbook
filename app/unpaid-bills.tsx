"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Bill = { id: number; number: string; transactionDate: string; dueDate: string | null; status: string; total: number; paid: number; remaining: number };

export function UnpaidBills({ companyId, locationId, party, currency, paymentId, selectedBillId, onSelect, selectedBillIds, onSelectMany }: { companyId: number; locationId: number; party: string; currency: string; paymentId?: string; selectedBillId: string; onSelect: (bill: Bill | null) => void; selectedBillIds?: number[]; onSelectMany?: (bills: Bill[]) => void }) {
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
  const isSelected = (bill: Bill) => selectedBillIds ? selectedBillIds.includes(bill.id) : selectedBillId === String(bill.id);
  const choose = (bill: Bill) => { if (onSelectMany) onSelectMany((result.records || []).filter((entry) => entry.id === bill.id ? !isSelected(entry) : isSelected(entry))); else onSelect(bill); };
  const money = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(value);

  return <section className="overflow-hidden rounded-lg border bg-background" aria-label="Unpaid bills">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
      <div><h3 className="text-sm font-semibold">Unpaid bills</h3><p className="mt-0.5 text-xs text-muted-foreground">{onSelectMany ? "Select one or more bills; partial payments apply oldest-first." : "Select a bill or enter a smaller partial payment."}</p></div>
      {(selectedBillId || Boolean(selectedBillIds?.length)) && <Button type="button" size="sm" variant="outline" onClick={() => onSelectMany ? onSelectMany([]) : onSelect(null)}>Clear selection</Button>}
    </div>
    <div aria-live="polite">
      {!ready ? <p className="px-4 py-3 text-sm text-muted-foreground">Select a vendor, inventory and currency to see unpaid bills.</p> : result.error ? <div className="flex items-center justify-between gap-3 px-4 py-3"><p role="alert" className="text-sm text-rose-600">{result.error}</p><Button type="button" variant="outline" onClick={() => { setResult({}); setAttempt((value) => value + 1); }}>Retry</Button></div> : !result.records ? <p className="px-4 py-3 text-sm text-muted-foreground">Loading unpaid bills…</p> : !result.records.length ? <p className="px-4 py-3 text-sm text-muted-foreground">No unpaid bills for this vendor, inventory and currency.</p> : <>
        <div className="max-h-48 overflow-auto"><Table className="min-w-[760px] text-sm [&_td]:py-2 [&_th]:h-9"><TableHeader><TableRow><TableHead>{onSelectMany ? <input type="checkbox" aria-label="Select all unpaid bills" checked={Boolean(result.records?.length) && result.records!.every(isSelected)} onChange={(event) => onSelectMany(event.target.checked ? result.records || [] : [])} className="size-4 accent-emerald-600" /> : "Select"}</TableHead><TableHead>Reference</TableHead><TableHead>Bill date</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total ({currency})</TableHead><TableHead className="text-right">Remaining ({currency})</TableHead></TableRow></TableHeader><TableBody>{result.records.map((bill) => <TableRow key={bill.id} data-state={isSelected(bill) ? "selected" : undefined}><TableCell><input type={onSelectMany ? "checkbox" : "radio"} name="payment-bill" aria-label={`Select bill ${bill.number}`} checked={isSelected(bill)} onChange={() => choose(bill)} className="size-4 accent-emerald-600" /></TableCell><TableCell className="font-medium">{bill.number}</TableCell><TableCell>{bill.transactionDate}</TableCell><TableCell>{bill.dueDate || "—"}</TableCell><TableCell className="capitalize">{bill.status}</TableCell><TableCell className="text-right">{money(bill.total)}</TableCell><TableCell className="text-right font-semibold">{money(bill.remaining)}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex justify-between border-t bg-muted/20 px-4 py-3 text-sm font-semibold"><span>{result.records.length} unpaid {result.records.length === 1 ? "bill" : "bills"}</span><span>Total remaining · {money(result.records.reduce((sum, bill) => sum + bill.remaining, 0))}</span></div>
      </>}
    </div>
  </section>;
}
