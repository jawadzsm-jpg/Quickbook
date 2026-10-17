"use client";

import { DocumentExtraFields, type DocumentExtra } from "./document-extra-fields";
import { useEffect, useState } from "react";
import { Eye, Save } from "lucide-react";
import { toast } from "sonner";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InvoiceLine = { id: number; description: string; quantity: number; unitPrice: number; invoiced: number; remaining: number; available: number; stockItemId: number | null; itemId: number | null };
type InvoiceData = { source: { number: string; status: string; type: string; currency: string; memo: string | null }; locationId: number; locations: { id: number; name: string }[]; lines: InvoiceLine[]; invoices: { id: number; number: string; transactionDate: string; total: number; currency: string; locationId: number }[] };

export function SalesSourceInvoicing({ sourceId, companyId, onSaved, onViewInvoice }: { sourceId: number; companyId: number; onSaved: () => void; onViewInvoice: (id: number) => void }) {
  const [data, setData] = useState<InvoiceData>();
  const [locationId, setLocationId] = useState(0);
  const [activeLines, setActiveLines] = useState<number[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lineExtras, setLineExtras] = useState<Record<number, DocumentExtra>>({});
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
  const skuLock = useSkuLock(data ? { resource: "records", kind: "transactions", companyId, locationId: (data?.locationId || locationId), salesSourceId: sourceId, lines: data.lines.filter((line) => Number(quantities[line.id]) > 0 || activeLines.includes(line.id)).map((line) => ({ sourceLineId: line.id })) } : null);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!skuLock.ready) return;
    if (!data || saving || !inventoryReady) return;
    const lines = data.lines.filter((line) => Number(quantities[line.id]) > 0).map((line) => ({ sourceLineId: line.id, quantity: Number(quantities[line.id]), ...lineExtras[line.id] }));
    if (!lines.length) return setError("Enter quantities to invoice, or choose Fill available quantities.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify({ kind: "transactions", type: "invoice", companyId, locationId: data.locationId, salesSourceId: sourceId, transactionDate: date, memo, lines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save invoice.");
      toast.success(`Invoice ${result.record.number} saved. Remaining quantities stay on the source document.`);
      setActiveLines([]);
      setQuantities({});
      setLineExtras({});
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save invoice."); }
    finally { setSaving(false); }
  }
  // Typed quantities or notes are unsaved edits ("Save before closing?" in the document window).
  const unsaved = Object.values(quantities).some((value) => Number(value) > 0) || memo.trim() !== "";
  return <section className="document-internal-only min-w-0 rounded-xl border bg-muted/30 p-4" data-unsaved={unsaved ? "" : undefined}>
    <h3 className="font-semibold">Create invoice from this {data?.source ? "document" : "estimate or sales order"}</h3>
    <p className="mt-1 text-sm text-muted-foreground">Invoice available items now. Reopen this document later to invoice the remaining quantities.</p>
    <SkuLockNotice message={skuLock.message} />
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {loading && <p className="mt-3 text-sm" role="status">Loading stock and remaining quantities…</p>}
    {data && <form onSubmit={save} className="mt-4 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Invoice inventory<select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" value={locationId || data.locationId} required disabled={saving} onChange={(event) => { setLoading(true); setQuantities({}); setLineExtras({}); setError(""); setLocationId(Number(event.target.value)); }}>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Invoice date<Input type="date" required disabled={saving} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      <div className="space-y-3">{data.lines.map((line) => <article key={line.id} className="min-w-0 rounded-xl border bg-card p-3 text-card-foreground sm:p-4"><div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"><div className="min-w-0"><p className="whitespace-pre-wrap break-words font-medium [overflow-wrap:anywhere]">{line.description}</p><p className="mt-2 text-xs text-muted-foreground">Unit price · {data.source.currency} <span className="font-semibold tabular-nums">{line.unitPrice.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></p></div><div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-5">{[['Ordered',line.quantity],['Invoiced',line.invoiced],['Remaining',line.remaining],['Available',line.itemId?line.available:'—']].map(([label,value])=><div key={label} className="min-w-0 rounded-lg bg-muted/30 p-2"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-words tabular-nums">{value}</strong></div>)}<label className="grid min-w-0 gap-1 text-xs">Invoice now<Input className="min-w-0 tabular-nums" aria-label={`Invoice quantity for ${line.description}`} type="number" min="0" step="any" max={Math.min(line.remaining,line.available)} disabled={skuLock.blocked || !inventoryReady || saving || line.remaining <= 0 || line.available <= 0} onFocus={()=>setActiveLines(old=>old.includes(line.id)?old:[...old,line.id])} value={quantities[line.id] || ''} placeholder="0" onChange={event=>setQuantities(old=>({...old,[line.id]:event.target.value}))} /></label></div></div>{Number(quantities[line.id])>0&&<div className="mt-3 border-t pt-3"><DocumentExtraFields value={lineExtras[line.id] || {comments:'',serialNumber:''}} onChange={value=>setLineExtras(old=>({...old,[line.id]:value}))} disabled={saving}/></div>}</article>)}</div>
      <label className="grid gap-2 text-sm">Additional invoice notes<Input disabled={saving} value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      <label className="grid gap-2 text-sm">Invoice memo<textarea readOnly className="min-h-20 w-full rounded-md border bg-background p-3" value={[data.source.memo, memo, `Invoiced from ${data.source.type} ${data.source.number}`].filter(Boolean).join(" · ")} /><span className="text-muted-foreground">The source document number is included automatically when you save.</span></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!inventoryReady || saving} onClick={() => setQuantities(Object.fromEntries(data.lines.map((line) => [line.id, String(limits.get(line.id) ?? 0)])))}>Fill available quantities</Button><Button type="submit" data-save-changes disabled={!skuLock.ready || !inventoryReady || saving || !data.lines.some((line) => line.remaining > 0 && line.available > 0)}><Save className="size-4" />{saving ? "Saving…" : "Save Invoice"}</Button></div>
    </form>}
    {data && data.invoices.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-sm font-semibold">Created invoices</h4>{data.invoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span>{invoice.number} · {invoice.transactionDate} · {data.locations.find((location) => location.id === invoice.locationId)?.name} · {invoice.currency} {invoice.total.toFixed(2)}</span><Button type="button" variant="ghost" size="icon" title="View invoice" aria-label={`View invoice ${invoice.number}`} onClick={() => onViewInvoice(invoice.id)}><Eye className="size-4" /></Button></div>)}</div>}
  </section>;
}
