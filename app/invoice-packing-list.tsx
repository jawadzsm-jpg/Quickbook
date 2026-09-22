"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, History, PackagePlus, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createA4PdfBlob, downloadPdfBlob } from "@/lib/document-output";

type InvoiceLine = { id: number; itemId: number | null; itemNumber: string | null; sku: string | null; description: string; invoicedQuantity: number; packedQuantity: number; remainingQuantity: number; hsCode: string | null; countryOfOrigin: string | null; dimensionText: string | null; lengthCm: number; widthCm: number; heightCm: number; unitWeightKg: number };
type PackedLine = { id: number; packingListId: number; invoiceLineId: number; itemNumber: string; sku: string; description: string; hsCode: string; countryOfOrigin: string; packedQuantity: number; unitsPerCarton: number; cartonCount: number; cartonReference: string; grossWeightKg: number; cartonWeightKg: number; dimensionText: string; lengthCm: number; widthCm: number; heightCm: number; cbmPerCarton: number; totalCbm: number };
type PackingList = { id: number; number: string; packingDate: string; deliveryAddress: string; memo: string; createdAt: string; creator: string | null; creatorEmail: string | null; lines: PackedLine[] };
type PackingData = { invoice: { id: number; number: string; party: string; transactionDate: string }; customer: { company?: string; billingName?: string; country?: string; phone?: string; email?: string } | null; lines: InvoiceLine[]; packingLists: PackingList[]; createdId?: number };
type Draft = { key: string; invoiceLineId: number; selected: boolean; extra: boolean; packedQuantity: string; unitsPerCarton: string; cartonReference: string; grossWeightKg: string; dimensionText: string; lengthCm: string; widthCm: string; heightCm: string };

const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const display = (value: number, places = 3) => Number(value.toFixed(places)).toLocaleString("en-AE", { maximumFractionDigits: places });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);

function cartonKeys(value: string) {
  const keys: string[] = [];
  for (const part of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range && Number(range[2]) >= Number(range[1]) && Number(range[2]) - Number(range[1]) < 500) {
      for (let current = Number(range[1]); current <= Number(range[2]); current += 1) keys.push(String(current));
    } else keys.push(part);
  }
  return [...new Set(keys)];
}

const lineCartonKeys = (line: Pick<PackedLine, "cartonReference" | "cartonCount">, index: number) => {
  const saved = cartonKeys(line.cartonReference || "");
  return saved.length ? saved : Array.from({ length: Math.max(1, line.cartonCount) }, (_, offset) => `auto-${index}-${offset}`);
};
const uniqueCartonCount = (list: PackingList) => new Set(list.lines.flatMap(lineCartonKeys)).size;

function makeDraft(line: InvoiceLine, key: string, cartonReference: string, extra = false): Draft {
  return {
    key, invoiceLineId: line.id, selected: extra, extra,
    packedQuantity: extra ? "" : String(line.remainingQuantity),
    unitsPerCarton: String(line.remainingQuantity || 1), cartonReference,
    grossWeightKg: extra ? "0" : line.unitWeightKg > 0 ? String(Number((line.unitWeightKg * line.remainingQuantity).toFixed(3))) : "0",
    dimensionText: line.dimensionText || "", lengthCm: String(line.lengthCm || 0), widthCm: String(line.widthCm || 0), heightCm: String(line.heightCm || 0),
  };
}

function initialDraft(lines: InvoiceLine[]) {
  return lines.map((line, index) => makeDraft(line, `invoice-${line.id}`, String(index + 1)));
}

export function InvoicePackingListDialog({ open, onOpenChange, companyId, companyName, invoiceId }: { open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; invoiceId: number }) {
  const [data, setData] = useState<PackingData | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [packingDate, setPackingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
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

  const selectedRows = useMemo(() => drafts.flatMap((draft, index) => {
    if (!draft.selected) return [];
    const line = data?.lines.find((entry) => entry.id === draft.invoiceLineId);
    if (!line) return [];
    const quantity = Math.max(0, number(draft.packedQuantity));
    const perCarton = Math.max(0, number(draft.unitsPerCarton));
    const cartons = perCarton > 0 ? Math.ceil(quantity / perCarton) : 0;
    const keys = cartonKeys(draft.cartonReference);
    const effectiveKeys = keys.length ? keys : Array.from({ length: cartons }, (_, offset) => `draft-${index}-${offset}`);
    const cbmPerCarton = number(draft.lengthCm) * number(draft.widthCm) * number(draft.heightCm) / 1_000_000;
    return [{ line, draft, quantity, cartons, cartonKeys: effectiveKeys, cbmPerCarton, weight: Math.max(0, number(draft.grossWeightKg)) }];
  }), [data?.lines, drafts]);
  const totals = useMemo(() => {
    const cbmByCarton = new Map<string, number>();
    let quantity = 0; let weight = 0;
    for (const row of selectedRows) {
      quantity += row.quantity; weight += row.weight;
      for (const key of row.cartonKeys) cbmByCarton.set(key, Math.max(cbmByCarton.get(key) ?? 0, row.cbmPerCarton));
    }
    return { quantity, cartons: cbmByCarton.size, weight, cbm: [...cbmByCarton.values()].reduce((sum, value) => sum + value, 0) };
  }, [selectedRows]);
  const activeList = data?.packingLists.find((list) => list.id === selectedListId) ?? null;
  const remainingTotal = (data?.lines || []).reduce((sum, line) => sum + line.remainingQuantity, 0);

  function update(key: string, changes: Partial<Draft>) {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...changes } : draft));
  }

  function addLine() {
    const line = data?.lines.find((entry) => entry.remainingQuantity > 0);
    if (!line) return toast.error("All invoice quantities are already packed.");
    setDrafts((current) => {
      const numericCartons = current.flatMap((draft) => cartonKeys(draft.cartonReference)).map(Number).filter(Number.isFinite);
      const nextCarton = String((numericCartons.length ? Math.max(...numericCartons) : 0) + 1);
      return [...current, makeDraft(line, `extra-${Date.now()}-${current.length}`, nextCarton, true)];
    });
  }

  function changeLine(draft: Draft, invoiceLineId: number) {
    const line = data?.lines.find((entry) => entry.id === invoiceLineId);
    if (!line) return;
    const replacement = makeDraft(line, draft.key, draft.cartonReference, true);
    update(draft.key, replacement);
  }

  async function save() {
    if (!selectedRows.length) return toast.error("Select at least one invoice item to pack.");
    const selectedByLine = new Map<number, number>();
    for (const row of selectedRows) {
      if (row.quantity <= 0) return toast.error(`Enter a packing quantity for ${row.line.description}.`);
      selectedByLine.set(row.line.id, (selectedByLine.get(row.line.id) ?? 0) + row.quantity);
      if (number(row.draft.unitsPerCarton) <= 0) return toast.error(`Enter units per carton for ${row.line.description}.`);
      if (row.cartonKeys.length < row.cartons) return toast.error(`${row.line.description} needs ${row.cartons} carton number(s). Use a range such as 1-${row.cartons}.`);
    }
    for (const [lineId, quantity] of selectedByLine) { const line = data?.lines.find((entry) => entry.id === lineId); if (line && quantity > line.remainingQuantity + 0.000001) return toast.error(`${line.description} has only ${display(line.remainingQuantity, 2)} remaining.`); }
    setSaving(true);
    try {
      const response = await fetch("/api/packing-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        companyId, invoiceId, packingDate, deliveryAddress, memo,
        lines: selectedRows.map(({ line, draft, quantity }) => ({ invoiceLineId: line.id, packedQuantity: quantity, unitsPerCarton: number(draft.unitsPerCarton), cartonReference: draft.cartonReference, grossWeightKg: number(draft.grossWeightKg), dimensionText: draft.dimensionText, lengthCm: number(draft.lengthCm), widthCm: number(draft.widthCm), heightCm: number(draft.heightCm) })),
      }) });
      const next = await response.json() as PackingData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not save packing list");
      setData(next); setDrafts(initialDraft(next.lines)); setMemo(""); setSelectedListId(next.createdId ?? next.packingLists.at(-1)?.id ?? null);
      toast.success(`Packing list ${next.packingLists.find((list) => list.id === next.createdId)?.number || "saved"}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save packing list"); }
    finally { setSaving(false); }
  }

  function packingListDocument(list: PackingList) {
    if (!data) return null;
    const cartonWeights = new Map<string, number>();
    const cartonCbm = new Map<string, number>();
    list.lines.forEach((line, index) => {
      const keys = lineCartonKeys(line, index);
      const contribution = Number(line.grossWeightKg) / Math.max(1, keys.length);
      for (const key of keys) {
        cartonWeights.set(key, (cartonWeights.get(key) ?? 0) + contribution);
        cartonCbm.set(key, Math.max(cartonCbm.get(key) ?? 0, Number(line.cbmPerCarton)));
      }
    });
    const rows = list.lines.map((line, index) => {
      const keys = lineCartonKeys(line, index);
      const weights = [...new Set(keys.map((key) => display(cartonWeights.get(key) ?? 0)))];
      const cartonWeight = weights.length === 1 ? weights[0] : keys.map((key) => `${escapeHtml(key)}: ${display(cartonWeights.get(key) ?? 0)}`).join(" / ");
      const dimensions = line.lengthCm > 0 || line.widthCm > 0 || line.heightCm > 0
        ? `${display(line.lengthCm)}×${display(line.widthCm)}×${display(line.heightCm)}`
        : line.dimensionText || "—";
      return `<tr><td>${index + 1}</td><td class="description">${escapeHtml(line.description)}<small>${escapeHtml(line.itemNumber ? `#${line.itemNumber}` : line.sku)}</small></td><td>${display(line.packedQuantity, 2)}</td><td>${display(line.grossWeightKg)}</td><td>${escapeHtml(line.countryOfOrigin || "—")}</td><td>${escapeHtml(line.hsCode || "—")}</td><td>${keys.length}</td><td>${escapeHtml(line.cartonReference || keys.join(", "))}</td><td>${cartonWeight}</td><td>${escapeHtml(dimensions)}<small>${display(line.cbmPerCarton)} m³</small></td><td>${display(line.totalCbm)} m³</td></tr>`;
    }).join("");
    const quantity = list.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0);
    const cartons = uniqueCartonCount(list);
    const weight = list.lines.reduce((sum, line) => sum + Number(line.grossWeightKg), 0);
    const cbm = [...cartonCbm.values()].reduce((sum, value) => sum + value, 0);
    const styles = `@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}.packing-page{width:194mm;max-width:194mm;margin:0 auto;background:#fff;color:#111;font:9px Arial,sans-serif}.packing-page .company{text-align:center;font-weight:700;font-size:10px;margin:0 0 3px}.packing-page h1{text-align:center;font-size:19px;margin:3px 0 11px}.packing-page .meta{margin-bottom:10px;font-size:9px;line-height:1.5}.packing-page .meta strong{display:inline-block;min-width:76px}.packing-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.5px}.packing-page col.no{width:2.5%}.packing-page col.description{width:21%}.packing-page col.qty{width:4.5%}.packing-page col.gross{width:8%}.packing-page col.origin{width:8%}.packing-page col.hs{width:8%}.packing-page col.ctn{width:4%}.packing-page col.ref{width:5%}.packing-page col.weight{width:9%}.packing-page col.dimension{width:15%}.packing-page col.cbm{width:15%}.packing-page thead{display:table-header-group}.packing-page tr{break-inside:avoid;page-break-inside:avoid}.packing-page th,.packing-page td{border:.25mm solid #222;padding:3px 1.5px;text-align:center;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}.packing-page th{background:#eee;font-size:6.2px;line-height:1.15}.packing-page .description{font-weight:600}.packing-page small{display:block;margin-top:2px;color:#444;font-size:5.8px}.packing-page .totals{margin-top:10px;font-size:9.5px;font-weight:700;line-height:1.55}.packing-page .memo{margin-top:7px;font-size:8px}@media print{html,body{margin:0;padding:0;background:#fff}.print-toolbar{display:none!important}.packing-page{width:100%;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    const html = `<div class="packing-page"><p class="company">${escapeHtml(companyName)}</p><h1>PACKING LIST</h1><div class="meta"><div><strong>Customer Name:</strong> ${escapeHtml(data.invoice.party)}</div><div><strong>Delivery Address:</strong> ${escapeHtml(list.deliveryAddress || "—")}</div><div><strong>Date:</strong> ${escapeHtml(list.packingDate)}</div><div><strong>Invoice #:</strong> ${escapeHtml(data.invoice.number)}</div><div><strong>Packing List:</strong> ${escapeHtml(list.number)}</div></div><table><colgroup><col class="no"><col class="description"><col class="qty"><col class="gross"><col class="origin"><col class="hs"><col class="ctn"><col class="ref"><col class="weight"><col class="dimension"><col class="cbm"></colgroup><thead><tr><th>#</th><th>DESCRIPTION</th><th>QTY</th><th>TOTAL GROSS<br>WEIGHT/KG</th><th>MADE IN</th><th>HS CODE</th><th>CTN</th><th>CTN #</th><th>CTN WEIGHT/KG</th><th>CTN DIMENSION/CM</th><th>TOTAL CTN CBM</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div>Total Qty → ${display(quantity, 2)} PCS</div><div>Total CTN(s) → ${cartons}</div><div>Total Weight → ${display(weight)} KG</div><div>Total CBM → ${display(cbm)} m³</div></div>${list.memo ? `<p class="memo"><strong>Memo:</strong> ${escapeHtml(list.memo)}</p>` : ""}</div>`;
    return { styles, html };
  }

  function printList(list: PackingList) {
    const document = packingListDocument(list);
    if (!document) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the packing list.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(list.number)}</title><style>${document.styles}</style><style>body{margin:0;padding:8mm;background:#fff}.print-toolbar{display:flex;justify-content:flex-end;gap:8px;width:194mm;margin:0 auto 8px}.print-toolbar button{padding:7px 14px}</style></head><body><div class="print-toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${document.html}</body></html>`);
    popup.document.close();
  }

  async function downloadListPdf(list: PackingList) {
    const output = packingListDocument(list);
    if (!output) return;
    setPdfBusy(true);
    const host = window.document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:194mm;background:#fff;z-index:-1";
    host.innerHTML = `<style>${output.styles}</style>${output.html}`;
    window.document.body.appendChild(host);
    try {
      await window.document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const page = host.querySelector<HTMLElement>(".packing-page");
      if (!page) throw new Error("Could not prepare the packing list PDF.");
      const blob = await createA4PdfBlob(page, { orientation: "portrait", marginMm: 8, title: list.number });
      downloadPdfBlob(blob, `${list.number}.pdf`);
      toast.success("Packing list PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the packing list PDF.");
    } finally {
      host.remove();
      setPdfBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>Invoice Packing Lists · {data?.invoice.number || "Loading…"}</DialogTitle><DialogDescription>Select invoice items and pack only the remaining balance. Add another line to split repacked cartons or use the same CTN number for multiple items in one carton.</DialogDescription></DialogHeader>
    {loading || !data ? <p className="py-16 text-center text-slate-500">Loading invoice packing details…</p> : <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm dark:bg-slate-900/70 sm:grid-cols-4"><div><span className="text-slate-500 dark:text-slate-400">Customer</span><strong className="block">{data.invoice.party}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Invoice Qty</span><strong className="block">{display(data.lines.reduce((sum, line) => sum + Number(line.invoicedQuantity), 0), 2)}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Already Packed</span><strong className="block">{display(data.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0), 2)}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Balance Qty</span><strong className="block text-amber-700 dark:text-amber-400">{display(remainingTotal, 2)}</strong></div></div>
      {data.packingLists.length ? <section className="rounded-xl border"><div className="flex items-center gap-2 border-b p-3"><History className="size-4" /><strong className="text-sm">Saved Packing Lists</strong></div><div className="flex flex-wrap gap-2 p-3">{data.packingLists.map((list) => <Button key={list.id} type="button" size="sm" variant={selectedListId === list.id ? "default" : "outline"} onClick={() => setSelectedListId(list.id)}>{list.number} · {list.lines.reduce((sum, line) => sum + line.packedQuantity, 0)} pcs</Button>)}</div>{activeList ? <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30"><span><CheckCircle2 className="mr-1 inline size-4 text-emerald-600" /><strong>{activeList.number}</strong> · {activeList.packingDate} · {uniqueCartonCount(activeList)} carton(s) · {display(activeList.lines.reduce((sum, line) => sum + line.totalCbm, 0))} m³</span><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => printList(activeList)}><Printer className="size-4" />Print A4 Portrait</Button><Button type="button" size="sm" variant="outline" disabled={pdfBusy} onClick={() => void downloadListPdf(activeList)}><Download className="size-4" />{pdfBusy ? "Creating PDF…" : "Download PDF"}</Button></div></div> : null}</section> : null}
      <section className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-sm"><Label>Packing Date</Label><Input type="date" value={packingDate} onChange={(event) => setPackingDate(event.target.value)} /></label><label className="space-y-1 text-sm sm:col-span-2"><Label>Delivery Address</Label><Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={500} /></label></div>
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[1500px]"><TableHeader><TableRow><TableHead>Select</TableHead><TableHead className="min-w-72">Invoice Item</TableHead><TableHead>Invoice</TableHead><TableHead>Packed</TableHead><TableHead>Balance</TableHead><TableHead className="min-w-28">Pack Qty</TableHead><TableHead className="min-w-28">PCS / CTN</TableHead><TableHead>CTN</TableHead><TableHead className="min-w-28">CTN No</TableHead><TableHead>HS Code / COO</TableHead><TableHead className="min-w-44">L × W × H cm</TableHead><TableHead className="min-w-28">Gross KG</TableHead><TableHead>CBM</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{drafts.map((draft, draftIndex) => {
              const line = data.lines.find((entry) => entry.id === draft.invoiceLineId);
              if (!line) return null;
              const selected = draft.selected;
              const quantity = number(draft.packedQuantity); const units = number(draft.unitsPerCarton);
              const cartons = units > 0 ? Math.ceil(quantity / units) : 0;
              const keys = cartonKeys(draft.cartonReference);
              const displayedCartons = keys.length || cartons;
              const cbm = number(draft.lengthCm) * number(draft.widthCm) * number(draft.heightCm) / 1_000_000 * displayedCartons;
              return <TableRow key={draft.key} className={line.remainingQuantity <= 0 ? "opacity-55" : selected ? "bg-blue-50/60 dark:bg-blue-950/35" : ""}>
                <TableCell><Checkbox className="size-5 border-2 border-slate-500 bg-white shadow-sm data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 dark:border-slate-200 dark:bg-slate-800 dark:data-[state=checked]:border-blue-400 dark:data-[state=checked]:bg-blue-500" disabled={line.remainingQuantity <= 0} checked={selected} onCheckedChange={(checked) => update(draft.key, { selected: checked === true })} aria-label={`Select packing row ${draftIndex + 1}`} /></TableCell>
                <TableCell>{draft.extra ? <Select value={String(line.id)} onValueChange={(value) => changeLine(draft, Number(value))}><SelectTrigger className="w-full min-w-64"><SelectValue /></SelectTrigger><SelectContent>{data.lines.filter((entry) => entry.remainingQuantity > 0).map((entry) => <SelectItem key={entry.id} value={String(entry.id)}>#{entry.itemNumber || "—"} · {entry.description}</SelectItem>)}</SelectContent></Select> : <><strong>{line.description}</strong><span className="block font-mono text-xs text-slate-500 dark:text-slate-400">#{line.itemNumber || "—"} · {line.sku || "—"}</span></>}</TableCell>
                <TableCell>{display(line.invoicedQuantity, 2)}</TableCell><TableCell>{display(line.packedQuantity, 2)}</TableCell><TableCell className="font-bold text-amber-700 dark:text-amber-400">{display(line.remainingQuantity, 2)}</TableCell>
                <TableCell><Input disabled={!selected} type="number" min="0.01" max={line.remainingQuantity} step="0.01" value={draft.packedQuantity} onChange={(event) => update(draft.key, { packedQuantity: event.target.value, grossWeightKg: line.unitWeightKg > 0 ? String(Number((line.unitWeightKg * number(event.target.value)).toFixed(3))) : draft.grossWeightKg })} /></TableCell>
                <TableCell><Input disabled={!selected} type="number" min="0.01" step="0.01" value={draft.unitsPerCarton} onChange={(event) => update(draft.key, { unitsPerCarton: event.target.value })} /></TableCell>
                <TableCell className="font-bold">{displayedCartons}</TableCell><TableCell><Input disabled={!selected} value={draft.cartonReference} onChange={(event) => update(draft.key, { cartonReference: event.target.value })} placeholder="1 or 1-3" maxLength={120} /></TableCell>
                <TableCell><span className="block">{line.hsCode || "—"}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{line.countryOfOrigin || "—"}</span></TableCell>
                <TableCell><div className="grid grid-cols-3 gap-1">{(["lengthCm", "widthCm", "heightCm"] as const).map((field) => <Input key={field} disabled={!selected} type="number" min="0" step="0.01" value={draft[field]} onChange={(event) => update(draft.key, { [field]: event.target.value })} aria-label={field} />)}</div></TableCell>
                <TableCell><Input disabled={!selected} type="number" min="0" step="0.001" value={draft.grossWeightKg} onChange={(event) => update(draft.key, { grossWeightKg: event.target.value })} /></TableCell><TableCell className="font-semibold">{display(cbm)} m³</TableCell>
                <TableCell>{draft.extra ? <Button type="button" size="icon" variant="outline" className="border-rose-300 text-rose-600" onClick={() => setDrafts((current) => current.filter((entry) => entry.key !== draft.key))} aria-label="Remove packing row"><Trash2 className="size-4" /></Button> : null}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500 dark:text-slate-400">Use the same CTN No on different lines to pack multiple items in one carton. Use ranges such as 1-3 for several cartons.</p><Button type="button" variant="outline" onClick={addLine}><Plus className="size-4" />Add Next Line</Button></div>
        <div className="grid gap-3 rounded-xl bg-slate-900 p-4 text-sm text-white sm:grid-cols-4"><div>Total selected qty<strong className="block text-lg">{display(totals.quantity, 2)}</strong></div><div>Total cartons<strong className="block text-lg">{totals.cartons}</strong></div><div>Total gross weight<strong className="block text-lg">{display(totals.weight)} KG</strong></div><div>Total CBM<strong className="block text-lg">{display(totals.cbm)} m³</strong></div></div>
        <label className="space-y-1 text-sm"><Label>Memo</Label><Textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={1000} placeholder="Optional packing instructions" /></label>
      </section>
    </div>}
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button type="button" disabled={loading || saving || !selectedRows.length} onClick={() => void save()}><PackagePlus className="size-4" />{saving ? "Saving…" : "Save Packing List"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
