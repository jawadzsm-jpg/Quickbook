"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, PackagePlus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type InvoiceLine = { id: number; itemId: number | null; itemNumber: string | null; sku: string | null; description: string; invoicedQuantity: number; packedQuantity: number; remainingQuantity: number; hsCode: string | null; countryOfOrigin: string | null; dimensionText: string | null; lengthCm: number; widthCm: number; heightCm: number; unitWeightKg: number };
type PackedLine = { id: number; packingListId: number; invoiceLineId: number; itemNumber: string; sku: string; description: string; hsCode: string; countryOfOrigin: string; packedQuantity: number; unitsPerCarton: number; cartonCount: number; grossWeightKg: number; cartonWeightKg: number; dimensionText: string; lengthCm: number; widthCm: number; heightCm: number; cbmPerCarton: number; totalCbm: number };
type PackingList = { id: number; number: string; packingDate: string; deliveryAddress: string; memo: string; createdAt: string; creator: string | null; creatorEmail: string | null; lines: PackedLine[] };
type PackingData = { invoice: { id: number; number: string; party: string; transactionDate: string }; customer: { company?: string; billingName?: string; country?: string; phone?: string; email?: string } | null; lines: InvoiceLine[]; packingLists: PackingList[]; createdId?: number };
type Draft = { selected: boolean; packedQuantity: string; unitsPerCarton: string; grossWeightKg: string; dimensionText: string; lengthCm: string; widthCm: string; heightCm: string };

const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const display = (value: number, places = 3) => Number(value.toFixed(places)).toLocaleString("en-AE", { maximumFractionDigits: places });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);

function initialDraft(lines: InvoiceLine[]) {
  return Object.fromEntries(lines.map((line) => [line.id, {
    selected: false,
    packedQuantity: String(line.remainingQuantity),
    unitsPerCarton: String(line.remainingQuantity || 1),
    grossWeightKg: line.unitWeightKg > 0 ? String(Number((line.unitWeightKg * line.remainingQuantity).toFixed(3))) : "0",
    dimensionText: line.dimensionText || "",
    lengthCm: String(line.lengthCm || 0), widthCm: String(line.widthCm || 0), heightCm: String(line.heightCm || 0),
  }]));
}

export function InvoicePackingListDialog({ open, onOpenChange, companyId, companyName, invoiceId }: { open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; invoiceId: number }) {
  const [data, setData] = useState<PackingData | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [packingDate, setPackingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!open || !invoiceId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/packing-lists?companyId=${companyId}&invoiceId=${invoiceId}`, { cache: "no-store" });
      const next = await response.json() as PackingData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not load packing lists");
      setData(next);
      setDrafts(initialDraft(next.lines));
      setDeliveryAddress((current) => current || [next.customer?.company || next.customer?.billingName, next.customer?.country].filter(Boolean).join(", "));
      setSelectedListId((current) => current ?? next.packingLists.at(-1)?.id ?? null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load packing lists"); }
    finally { setLoading(false); }
  }, [companyId, invoiceId, open]);

  // Refresh whenever a different customer invoice opens in the packing workflow.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const selectedRows = useMemo(() => (data?.lines || []).filter((line) => drafts[line.id]?.selected).map((line) => {
    const draft = drafts[line.id];
    const quantity = Math.max(0, number(draft.packedQuantity));
    const perCarton = Math.max(0, number(draft.unitsPerCarton));
    const cartons = perCarton > 0 ? Math.ceil(quantity / perCarton) : 0;
    const cbm = number(draft.lengthCm) * number(draft.widthCm) * number(draft.heightCm) / 1_000_000 * cartons;
    return { line, draft, quantity, cartons, cbm, weight: Math.max(0, number(draft.grossWeightKg)) };
  }), [data?.lines, drafts]);
  const totals = useMemo(() => selectedRows.reduce((sum, row) => ({ quantity: sum.quantity + row.quantity, cartons: sum.cartons + row.cartons, weight: sum.weight + row.weight, cbm: sum.cbm + row.cbm }), { quantity: 0, cartons: 0, weight: 0, cbm: 0 }), [selectedRows]);
  const activeList = data?.packingLists.find((list) => list.id === selectedListId) ?? null;
  const remainingTotal = (data?.lines || []).reduce((sum, line) => sum + line.remainingQuantity, 0);

  function update(lineId: number, changes: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...changes } }));
  }

  async function save() {
    if (!selectedRows.length) return toast.error("Select at least one invoice item to pack.");
    for (const row of selectedRows) {
      if (row.quantity <= 0 || row.quantity > row.line.remainingQuantity) return toast.error(`${row.line.description} has only ${display(row.line.remainingQuantity, 2)} remaining.`);
      if (number(row.draft.unitsPerCarton) <= 0) return toast.error(`Enter units per carton for ${row.line.description}.`);
    }
    setSaving(true);
    try {
      const response = await fetch("/api/packing-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        companyId, invoiceId, packingDate, deliveryAddress, memo,
        lines: selectedRows.map(({ line, draft, quantity }) => ({ invoiceLineId: line.id, packedQuantity: quantity, unitsPerCarton: number(draft.unitsPerCarton), grossWeightKg: number(draft.grossWeightKg), dimensionText: draft.dimensionText, lengthCm: number(draft.lengthCm), widthCm: number(draft.widthCm), heightCm: number(draft.heightCm) })),
      }) });
      const next = await response.json() as PackingData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not save packing list");
      setData(next); setDrafts(initialDraft(next.lines)); setMemo(""); setSelectedListId(next.createdId ?? next.packingLists.at(-1)?.id ?? null);
      toast.success(`Packing list ${next.packingLists.find((list) => list.id === next.createdId)?.number || "saved"}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save packing list"); }
    finally { setSaving(false); }
  }

  function printList(list: PackingList) {
    if (!data) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the packing list.");
    popup.opener = null;
    let cartonStart = 1;
    const rows = list.lines.map((line, index) => {
      const cartonEnd = cartonStart + line.cartonCount - 1;
      const cartonRange = line.cartonCount === 1 ? String(cartonStart) : `${cartonStart}-${cartonEnd}`;
      cartonStart = cartonEnd + 1;
      return `<tr><td>${index + 1}</td><td class="desc">${escapeHtml(line.description)}<small>${escapeHtml(line.itemNumber ? `#${line.itemNumber}` : line.sku)}</small></td><td>${display(line.packedQuantity, 2)}</td><td>${escapeHtml(line.countryOfOrigin || "—")}</td><td>${escapeHtml(line.hsCode || "—")}</td><td>${display(line.unitsPerCarton, 2)}</td><td>${line.cartonCount}</td><td>${cartonRange}</td><td>${display(line.grossWeightKg)}</td><td>${display(line.cartonWeightKg)}</td><td>${escapeHtml(line.dimensionText || `${display(line.lengthCm)}×${display(line.widthCm)}×${display(line.heightCm)} cm`)}</td><td>${display(line.totalCbm)} m³</td></tr>`;
    }).join("");
    const quantity = list.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0);
    const cartons = list.lines.reduce((sum, line) => sum + Number(line.cartonCount), 0);
    const weight = list.lines.reduce((sum, line) => sum + Number(line.grossWeightKg), 0);
    const cbm = list.lines.reduce((sum, line) => sum + Number(line.totalCbm), 0);
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(list.number)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#111;margin:0}h1{text-align:center;font-size:24px;margin:8px 0 18px}.company{text-align:center;font-weight:700;font-size:13px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;margin-bottom:16px;font-size:12px}.meta strong{display:inline-block;min-width:105px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #222;padding:6px 4px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}th{background:#eee;font-size:9px}.desc{text-align:left;font-weight:600}.desc small{display:block;margin-top:3px;color:#555}.totals{margin-top:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:13px;font-weight:700}.memo{margin-top:12px}.toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}.toolbar button{padding:7px 14px}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div><p class="company">${escapeHtml(companyName)}</p><h1>PACKING LIST</h1><div class="meta"><div><strong>Customer Name:</strong>${escapeHtml(data.invoice.party)}</div><div><strong>Packing List:</strong>${escapeHtml(list.number)}</div><div><strong>Delivery Address:</strong>${escapeHtml(list.deliveryAddress || "—")}</div><div><strong>Date:</strong>${escapeHtml(list.packingDate)}</div><div><strong>Invoice #:</strong>${escapeHtml(data.invoice.number)}</div><div><strong>Invoice Date:</strong>${escapeHtml(data.invoice.transactionDate)}</div></div><table><thead><tr><th>#</th><th style="width:20%">DESCRIPTION</th><th>QTY</th><th>MADE IN</th><th>HS CODE</th><th>PCS / CTN</th><th>CTN</th><th>CTN #</th><th>TOTAL GROSS KG</th><th>CTN WEIGHT KG</th><th>CTN DIMENSION</th><th>TOTAL CBM</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div>Total Qty: ${display(quantity, 2)} PCS</div><div>Total CTN(s): ${cartons}</div><div>Total Weight: ${display(weight)} KG</div><div>Total CBM: ${display(cbm)} m³</div></div>${list.memo ? `<p class="memo"><strong>Memo:</strong> ${escapeHtml(list.memo)}</p>` : ""}</body></html>`);
    popup.document.close();
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[1500px]"><DialogHeader><DialogTitle>Invoice Packing Lists · {data?.invoice.number || "Loading…"}</DialogTitle><DialogDescription>Select invoice items and pack only the remaining balance. Cartons, weight, HS Code, COO, dimensions, and CBM are connected to the saved item logistics.</DialogDescription></DialogHeader>
    {loading || !data ? <p className="py-16 text-center text-slate-500">Loading invoice packing details…</p> : <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-4"><div><span className="text-slate-500">Customer</span><strong className="block">{data.invoice.party}</strong></div><div><span className="text-slate-500">Invoice Qty</span><strong className="block">{display(data.lines.reduce((sum, line) => sum + Number(line.invoicedQuantity), 0), 2)}</strong></div><div><span className="text-slate-500">Already Packed</span><strong className="block">{display(data.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0), 2)}</strong></div><div><span className="text-slate-500">Balance Qty</span><strong className="block text-amber-700">{display(remainingTotal, 2)}</strong></div></div>
      {data.packingLists.length ? <section className="rounded-xl border"><div className="flex items-center gap-2 border-b p-3"><History className="size-4" /><strong className="text-sm">Saved Packing Lists</strong></div><div className="flex flex-wrap gap-2 p-3">{data.packingLists.map((list) => <Button key={list.id} type="button" size="sm" variant={selectedListId === list.id ? "default" : "outline"} onClick={() => setSelectedListId(list.id)}>{list.number} · {list.lines.reduce((sum, line) => sum + line.packedQuantity, 0)} pcs</Button>)}</div>{activeList ? <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-emerald-50 p-3 text-sm"><span><CheckCircle2 className="mr-1 inline size-4 text-emerald-600" /><strong>{activeList.number}</strong> · {activeList.packingDate} · {activeList.lines.reduce((sum, line) => sum + line.cartonCount, 0)} carton(s) · {display(activeList.lines.reduce((sum, line) => sum + line.totalCbm, 0))} m³</span><Button type="button" size="sm" variant="outline" onClick={() => printList(activeList)}><Printer className="size-4" />Print</Button></div> : null}</section> : null}
      <section className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-sm"><Label>Packing Date</Label><Input type="date" value={packingDate} onChange={(event) => setPackingDate(event.target.value)} /></label><label className="space-y-1 text-sm sm:col-span-2"><Label>Delivery Address</Label><Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={500} /></label></div>
        <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead className="min-w-64">Invoice Item</TableHead><TableHead>Invoice</TableHead><TableHead>Packed</TableHead><TableHead>Balance</TableHead><TableHead className="min-w-28">Pack Qty</TableHead><TableHead className="min-w-28">PCS / CTN</TableHead><TableHead>CTN</TableHead><TableHead>HS Code / COO</TableHead><TableHead className="min-w-36">L × W × H cm</TableHead><TableHead className="min-w-28">Gross KG</TableHead><TableHead>CBM</TableHead></TableRow></TableHeader><TableBody>{data.lines.map((line) => { const draft = drafts[line.id]; const selected = draft?.selected || false; const quantity = number(draft?.packedQuantity); const units = number(draft?.unitsPerCarton); const cartons = units > 0 ? Math.ceil(quantity / units) : 0; const cbm = number(draft?.lengthCm) * number(draft?.widthCm) * number(draft?.heightCm) / 1_000_000 * cartons; return <TableRow key={line.id} className={line.remainingQuantity <= 0 ? "opacity-55" : selected ? "bg-blue-50/60" : ""}><TableCell><Checkbox disabled={line.remainingQuantity <= 0} checked={selected} onCheckedChange={(checked) => update(line.id, { selected: checked === true })} /></TableCell><TableCell><strong>{line.description}</strong><span className="block font-mono text-xs text-slate-500">#{line.itemNumber || "—"} · {line.sku || "—"}</span></TableCell><TableCell>{display(line.invoicedQuantity, 2)}</TableCell><TableCell>{display(line.packedQuantity, 2)}</TableCell><TableCell className="font-bold text-amber-700">{display(line.remainingQuantity, 2)}</TableCell><TableCell><Input disabled={!selected} type="number" min="0.01" max={line.remainingQuantity} step="0.01" value={draft?.packedQuantity || ""} onChange={(event) => update(line.id, { packedQuantity: event.target.value, grossWeightKg: line.unitWeightKg > 0 ? String(Number((line.unitWeightKg * number(event.target.value)).toFixed(3))) : draft.grossWeightKg })} /></TableCell><TableCell><Input disabled={!selected} type="number" min="0.01" step="0.01" value={draft?.unitsPerCarton || ""} onChange={(event) => update(line.id, { unitsPerCarton: event.target.value })} /></TableCell><TableCell className="font-bold">{cartons}</TableCell><TableCell><span className="block">{line.hsCode || "—"}</span><span className="block text-xs text-slate-500">{line.countryOfOrigin || "—"}</span></TableCell><TableCell><div className="grid grid-cols-3 gap-1">{(["lengthCm", "widthCm", "heightCm"] as const).map((field) => <Input key={field} disabled={!selected} type="number" min="0" step="0.01" value={draft?.[field] || ""} onChange={(event) => update(line.id, { [field]: event.target.value })} />)}</div></TableCell><TableCell><Input disabled={!selected} type="number" min="0" step="0.001" value={draft?.grossWeightKg || ""} onChange={(event) => update(line.id, { grossWeightKg: event.target.value })} /></TableCell><TableCell className="font-semibold">{display(cbm)} m³</TableCell></TableRow>; })}</TableBody></Table></div>
        <div className="grid gap-3 rounded-xl bg-slate-900 p-4 text-sm text-white sm:grid-cols-4"><div>Total selected qty<strong className="block text-lg">{display(totals.quantity, 2)}</strong></div><div>Total cartons<strong className="block text-lg">{totals.cartons}</strong></div><div>Total gross weight<strong className="block text-lg">{display(totals.weight)} KG</strong></div><div>Total CBM<strong className="block text-lg">{display(totals.cbm)} m³</strong></div></div>
        <label className="space-y-1 text-sm"><Label>Memo</Label><Textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={1000} placeholder="Optional packing instructions" /></label>
      </section>
    </div>}
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button type="button" disabled={loading || saving || !selectedRows.length} onClick={() => void save()}><PackagePlus className="size-4" />{saving ? "Saving…" : "Save Packing List"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
