"use client";

import { useEffect, useState } from "react";
import { Eye, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InvoiceLine = { id: number; description: string; quantity: number; invoiced: number; remaining: number; available: number; stockItemId: number | null; itemId: number | null };
type InvoiceData = { source: { number: string; status: string }; locationId: number; locations: { id: number; name: string }[]; lines: InvoiceLine[]; invoices: { id: number; number: string; transactionDate: string; total: number; currency: string; locationId: number }[] };

export function SalesSourceInvoicing({ sourceId, companyId, onSaved, onViewInvoice }: { sourceId: number; companyId: number; onSaved: () => void; onViewInvoice: (id: number) => void }) {
  const [data, setData] = useState<InvoiceData>();
  const [locationId, setLocationId] = useState(0);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/records?kind=sales-invoicing&companyId=${companyId}&sourceId=${sourceId}${locationId ? `&locationId=${locationId}` : ""}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load invoice quantities.");
      setData(result); setError("");
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, sourceId, locationId]);
  const inventoryReady = !loading && Boolean(data) && (!locationId || data?.locationId === locationId);
  const limits = new Map<number, number>();
  const usedStock = new Map<number, number>();
  for (const line of data?.lines ?? []) {
    const available = line.itemId ? Math.max(0, line.available - (usedStock.get(line.stockItemId ?? 0) ?? 0)) : line.remaining;
    const limit = Math.min(line.remaining, available);
    limits.set(line.id, limit);
    if (line.itemId) usedStock.set(line.stockItemId ?? 0, (usedStock.get(line.stockItemId ?? 0) ?? 0) + limit);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || saving || !inventoryReady) return;
    const lines = data.lines.filter((line) => Number(quantities[line.id]) > 0).map((line) => ({ sourceLineId: line.id, quantity: Number(quantities[line.id]) }));
    if (!lines.length) return setError("Enter quantities to invoice, or choose Fill available quantities.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "transactions", type: "invoice", companyId, locationId: data.locationId, salesSourceId: sourceId, transactionDate: date, memo, lines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save invoice.");
      toast.success(`Invoice ${result.record.number} saved. Remaining quantities stay on the source document.`);
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save invoice."); }
    finally { setSaving(false); }
  }
  return <section className="document-internal-only rounded-xl border bg-slate-50 p-4">
    <h3 className="font-semibold">Create invoice from this {data?.source ? "document" : "estimate or sales order"}</h3>
    <p className="mt-1 text-sm text-muted-foreground">Invoice available items now. Reopen this document later to invoice the remaining quantities.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {loading && <p className="mt-3 text-sm" role="status">Loading stock and remaining quantities…</p>}
    {data && <form onSubmit={save} className="mt-4 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Invoice inventory<select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" value={locationId || data.locationId} required disabled={saving} onChange={(event) => { setLoading(true); setQuantities({}); setError(""); setLocationId(Number(event.target.value)); }}>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Invoice date<Input type="date" required disabled={saving} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      <div className="overflow-auto"><table className="w-full table-fixed text-sm"><thead><tr className="border-b"><th className="w-2/5 p-2 text-left">Item</th><th>Ordered</th><th>Invoiced</th><th>Remaining</th><th>Available</th><th>Invoice now</th></tr></thead><tbody>{data.lines.map((line) => <tr key={line.id} className="border-b"><td className="break-words p-2">{line.description}</td><td className="p-2 text-right">{line.quantity}</td><td className="p-2 text-right">{line.invoiced}</td><td className="p-2 text-right">{line.remaining}</td><td className="p-2 text-right">{line.itemId ? line.available : "—"}</td><td className="p-2"><Input aria-label={`Invoice quantity for ${line.description}`} type="number" min="0" step="any" max={Math.min(line.remaining, line.available)} disabled={!inventoryReady || saving || line.remaining <= 0 || line.available <= 0} value={quantities[line.id] || ""} placeholder="0" onChange={(event) => setQuantities((old) => ({ ...old, [line.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
      <label className="grid gap-2 text-sm">Invoice memo<Input disabled={saving} value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!inventoryReady || saving} onClick={() => setQuantities(Object.fromEntries(data.lines.map((line) => [line.id, String(limits.get(line.id) ?? 0)])))}>Fill available quantities</Button><Button type="submit" disabled={!inventoryReady || saving || !data.lines.some((line) => line.remaining > 0 && line.available > 0)}><Save className="size-4" />{saving ? "Saving…" : "Save Invoice"}</Button></div>
    </form>}
    {data && data.invoices.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-sm font-semibold">Created invoices</h4>{data.invoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span>{invoice.number} · {invoice.transactionDate} · {data.locations.find((location) => location.id === invoice.locationId)?.name} · {invoice.currency} {invoice.total.toFixed(2)}</span><Button type="button" variant="ghost" size="icon" title="View invoice" aria-label={`View invoice ${invoice.number}`} onClick={() => onViewInvoice(invoice.id)}><Eye className="size-4" /></Button></div>)}</div>}
  </section>;
}
