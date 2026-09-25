"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, History, PackagePlus, Pencil, Plus, Printer, Trash2 } from "lucide-react";
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
import { letterheadForDocument, type LetterheadDocument } from "@/lib/letterhead";
import type { LetterheadCompany } from "./letterhead-page";

type InvoiceLine = { id: number; itemId: number | null; itemNumber: string | null; sku: string | null; description: string; invoicedQuantity: number; unitPrice: number; packedQuantity: number; remainingQuantity: number; hsCode: string | null; countryOfOrigin: string | null; dimensionText: string | null; lengthCm: number; widthCm: number; heightCm: number; unitWeightKg: number };
type PackedLine = { id: number; packingListId: number; invoiceLineId: number; itemNumber: string; sku: string; description: string; hsCode: string; countryOfOrigin: string; packedQuantity: number; unitsPerCarton: number; cartonCount: number; cartonReference: string; grossWeightKg: number; cartonWeightKg: number; dimensionText: string; lengthCm: number; widthCm: number; heightCm: number; cbmPerCarton: number; totalCbm: number };
type PackingList = { id: number; number: string; packingDate: string; deliveryAddress: string; memo: string; createdAt: string; creator: string | null; creatorEmail: string | null; lines: PackedLine[] };
type PackingData = { invoice: { id: number; number: string; party: string; transactionDate: string; currency: string }; customer: { company?: string; billingName?: string; country?: string; phone?: string; email?: string } | null; lines: InvoiceLine[]; packingLists: PackingList[]; createdId?: number };
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

function cartonReferenceForCount(value: string, count: number) {
  const cleaned = value.trim();
  const keys = cartonKeys(cleaned);
  if (count > 1 && keys.length === 1 && /^\d+$/.test(keys[0])) {
    const start = Number(keys[0]);
    return { reference: `${start}-${start + count - 1}`, keys: Array.from({ length: count }, (_, offset) => String(start + offset)) };
  }
  return { reference: cleaned, keys };
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

function savedDrafts(list: PackingList): Draft[] {
  return list.lines.map((line, index) => ({
    key: `saved-${line.id}-${index}`, invoiceLineId: line.invoiceLineId, selected: true, extra: true,
    packedQuantity: String(line.packedQuantity), unitsPerCarton: String(line.unitsPerCarton), cartonReference: line.cartonReference,
    grossWeightKg: String(line.grossWeightKg), dimensionText: line.dimensionText,
    lengthCm: String(line.lengthCm), widthCm: String(line.widthCm), heightCm: String(line.heightCm),
  }));
}

export function InvoicePackingListDialog({ open, onOpenChange, companyId, companyName, setup, invoiceId, initialView = "packing" }: { open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; setup: LetterheadCompany & { letterheadDesign?: string }; invoiceId: number; initialView?: "packing" | "hs-summary" }) {
  const [data, setData] = useState<PackingData | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [packingDate, setPackingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [hsPdfBusy, setHsPdfBusy] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [editingListId, setEditingListId] = useState<number | null>(null);

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
    const normalized = cartonReferenceForCount(draft.cartonReference, cartons);
    const keys = normalized.keys;
    const effectiveKeys = keys.length ? keys : Array.from({ length: cartons }, (_, offset) => `draft-${index}-${offset}`);
    const cbmPerCarton = number(draft.lengthCm) * number(draft.widthCm) * number(draft.heightCm) / 1_000_000;
    return [{ line, draft, quantity, cartons, cartonReference: normalized.reference, cartonKeys: effectiveKeys, cbmPerCarton, weight: Math.max(0, number(draft.grossWeightKg)) }];
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
  const editingList = data?.packingLists.find((list) => list.id === editingListId) ?? null;
  const editingQuantityByLine = useMemo(() => {
    const quantities = new Map<number, number>();
    for (const line of editingList?.lines ?? []) quantities.set(line.invoiceLineId, (quantities.get(line.invoiceLineId) ?? 0) + Number(line.packedQuantity));
    return quantities;
  }, [editingList]);
  const availableQuantity = (line: InvoiceLine) => line.remainingQuantity + (editingQuantityByLine.get(line.id) ?? 0);
  const remainingTotal = (data?.lines || []).reduce((sum, line) => sum + availableQuantity(line), 0);
  const remainingAfterDraft = remainingTotal - totals.quantity;
  const editingTotal = editingList?.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0) ?? 0;
  const packedBeforeDraft = (data?.lines || []).reduce((sum, line) => sum + Number(line.packedQuantity), 0) - editingTotal;
  const selectedQuantityByLine = useMemo(() => {
    const quantities = new Map<number, number>();
    for (const row of selectedRows) quantities.set(row.line.id, (quantities.get(row.line.id) ?? 0) + row.quantity);
    return quantities;
  }, [selectedRows]);

  function update(key: string, changes: Partial<Draft>) {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...changes } : draft));
  }

  function addLine() {
    const line = data?.lines.find((entry) => availableQuantity(entry) > 0);
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

  function editList(list: PackingList) {
    setEditingListId(list.id);
    setSelectedListId(list.id);
    setPackingDate(list.packingDate);
    setDeliveryAddress(list.deliveryAddress);
    setMemo(list.memo);
    setDrafts(savedDrafts(list));
  }

  function cancelEdit() {
    setEditingListId(null);
    setDrafts(initialDraft(data?.lines ?? []));
    setMemo("");
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
    for (const [lineId, quantity] of selectedByLine) { const line = data?.lines.find((entry) => entry.id === lineId); const available = line ? availableQuantity(line) : 0; if (line && quantity > available + 0.000001) return toast.error(`${line.description} has only ${display(available, 2)} available.`); }
    setSaving(true);
    try {
      const response = await fetch("/api/packing-lists", { method: editingListId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        companyId, invoiceId, packingListId: editingListId, packingDate, deliveryAddress, memo,
        lines: selectedRows.map(({ line, draft, quantity, cartonReference }) => ({ invoiceLineId: line.id, packedQuantity: quantity, unitsPerCarton: number(draft.unitsPerCarton), cartonReference, grossWeightKg: number(draft.grossWeightKg), dimensionText: draft.dimensionText, lengthCm: number(draft.lengthCm), widthCm: number(draft.widthCm), heightCm: number(draft.heightCm) })),
      }) });
      const next = await response.json() as PackingData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not save packing list");
      const savedNumber = next.packingLists.find((list) => list.id === next.createdId)?.number || "saved";
      setData(next); setDrafts(initialDraft(next.lines)); setMemo(""); setEditingListId(null); setSelectedListId(next.createdId ?? next.packingLists.at(-1)?.id ?? null);
      toast.success(`Packing list ${savedNumber} ${editingListId ? "updated" : "saved"}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save packing list"); }
    finally { setSaving(false); }
  }

  function linkedLetterhead(type: LetterheadDocument, landscape: boolean) {
    const template = letterheadForDocument(setup.letterheadDesign, type);
    if (!template) return { html: `<p class="company">${escapeHtml(companyName)}</p>`, stamp: "" };
    const safeImage = (value?: string) => value && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : "";
    const image = template.showLogo ? safeImage(setup.logoData) : "";
    const rightImage = template.showRightLogo ? safeImage(setup.rightLogoData) : "";
    const logo = image ? `<img src="${image}" alt="Company logo" style="max-width:65mm;max-height:22mm;object-fit:contain">` : escapeHtml(companyName);
    const right = rightImage ? `<img src="${rightImage}" alt="Right logo" style="max-width:55mm;max-height:20mm;object-fit:contain">` : "";
    const header = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8mm;border-bottom:1px solid #aaa;padding-bottom:4mm;margin-bottom:5mm"><div>${logo}</div><div style="text-align:right;color:${template.color}">${right}<div dir="auto" style="font-size:18px;font-weight:700">${escapeHtml(template.heading)}</div><div dir="auto">${escapeHtml(template.subtitle)}</div></div></div><div style="text-align:center;font-weight:700;margin-bottom:4mm">${[setup.phone, setup.email, template.website].filter(Boolean).map(escapeHtml).join("　·　")}</div>`;
    const stampData = template.showStamp ? safeImage(setup.stampData) : "";
    const left = landscape ? Math.round(template.stampLeft / 210 * 297) : template.stampLeft;
    const top = landscape ? Math.round(template.stampTop / 297 * 210) : template.stampTop;
    const stamp = stampData ? `<img src="${stampData}" alt="Company stamp" style="position:absolute;left:${left}mm;top:${top}mm;max-width:32mm;max-height:23mm;object-fit:contain">` : "";
    return { html: header, stamp };
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
    const styles = `@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}.packing-page{width:281mm;max-width:281mm;margin:0 auto;background:#fff;color:#111;font:9px Arial,sans-serif}.packing-page .company{text-align:center;font-weight:700;font-size:11px;margin:0 0 3px}.packing-page h1{text-align:center;font-size:20px;margin:3px 0 11px}.packing-page .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;margin-bottom:10px;font-size:9px;line-height:1.45}.packing-page .meta strong{display:inline-block;min-width:76px}.packing-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.5px}.packing-page col.no{width:3%}.packing-page col.description{width:25%}.packing-page col.qty{width:6%}.packing-page col.gross{width:9%}.packing-page col.origin{width:8%}.packing-page col.hs{width:9%}.packing-page col.ctn{width:5%}.packing-page col.ref{width:6%}.packing-page col.weight{width:9%}.packing-page col.dimension{width:12%}.packing-page col.cbm{width:8%}.packing-page thead{display:table-header-group}.packing-page tr{break-inside:avoid;page-break-inside:avoid}.packing-page th,.packing-page td{border:.25mm solid #222;padding:4px 2px;text-align:center;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}.packing-page th{background:#eee;font-size:7px;line-height:1.15}.packing-page .description{font-weight:600}.packing-page small{display:block;margin-top:2px;color:#444;font-size:6.5px}.packing-page .totals{margin-top:10px;font-size:10px;font-weight:700;line-height:1.55}.packing-page .memo{margin-top:7px;font-size:9px}@media print{html,body{margin:0;padding:0;background:#fff}.print-toolbar{display:none!important}.packing-page{width:100%;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    const letterhead = linkedLetterhead("packing-list", true);
    const html = `<div class="packing-page" style="position:relative">${letterhead.html}${letterhead.stamp}<h1>PACKING LIST</h1><div class="meta"><div><strong>Customer Name:</strong> ${escapeHtml(data.invoice.party)}</div><div><strong>Delivery Address:</strong> ${escapeHtml(list.deliveryAddress || "—")}</div><div><strong>Date:</strong> ${escapeHtml(list.packingDate)}</div><div><strong>Invoice #:</strong> ${escapeHtml(data.invoice.number)}</div><div><strong>Packing List:</strong> ${escapeHtml(list.number)}</div></div><table><colgroup><col class="no"><col class="description"><col class="qty"><col class="gross"><col class="origin"><col class="hs"><col class="ctn"><col class="ref"><col class="weight"><col class="dimension"><col class="cbm"></colgroup><thead><tr><th>#</th><th>DESCRIPTION</th><th>QTY</th><th>TOTAL GROSS<br>WEIGHT/KG</th><th>MADE IN</th><th>HS CODE</th><th>CTN</th><th>CTN #</th><th>CTN WEIGHT/KG</th><th>CTN DIMENSION/CM</th><th>TOTAL CTN CBM</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div>Total Qty → ${display(quantity, 2)} PCS</div><div>Total CTN(s) → ${cartons}</div><div>Total Weight → ${display(weight)} KG</div><div>Total CBM → ${display(cbm)} m³</div></div>${list.memo ? `<p class="memo"><strong>Memo:</strong> ${escapeHtml(list.memo)}</p>` : ""}</div>`;
    return { styles, html };
  }

  function hsCodeSummaryDocument(list: PackingList) {
    if (!data) return null;
    const invoiceLines = new Map(data.lines.map((line) => [line.id, line]));
    const grouped = new Map<string, { country: string; description: string; hsCode: string; weight: number; units: number; value: number }>();

    for (const packed of list.lines) {
      const source = invoiceLines.get(packed.invoiceLineId);
      const country = (packed.countryOfOrigin || source?.countryOfOrigin || "—").trim() || "—";
      const description = (packed.description || source?.description || "—").trim() || "—";
      const hsCode = (packed.hsCode || source?.hsCode || "—").trim() || "—";
      const key = [country.toUpperCase(), description.toUpperCase(), hsCode.toUpperCase()].join("|");
      const current = grouped.get(key) ?? { country, description, hsCode, weight: 0, units: 0, value: 0 };
      current.weight += Number(packed.grossWeightKg || 0);
      current.units += Number(packed.packedQuantity || 0);
      current.value += Number(packed.packedQuantity || 0) * Number(source?.unitPrice || 0);
      grouped.set(key, current);
    }

    const summaryRows = [...grouped.values()];
    const totalQty = summaryRows.reduce((sum, row) => sum + row.units, 0);
    const totalWeight = summaryRows.reduce((sum, row) => sum + row.weight, 0);
    const totalValue = summaryRows.reduce((sum, row) => sum + row.value, 0);
    const currency = data.invoice.currency || "AED";
    const rows = summaryRows.map((row, index) =>
      `<tr><td>${index + 1}</td><td>${escapeHtml(row.country)}</td><td class="goods">${escapeHtml(row.description)}</td><td>${escapeHtml(row.hsCode)}</td><td>${display(row.weight, 2)}</td><td>${display(row.units, 2)}</td><td>${row.value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`
    ).join("");

    const styles = `@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}.hs-summary-page{width:190mm;max-width:190mm;margin:0 auto;background:#fff;color:#111;font:10px Arial,sans-serif}.hs-summary-page .company{text-align:center;font-weight:700;font-size:11px;margin:0 0 5px}.hs-summary-page h1{text-align:center;font-size:19px;margin:4px 0 18px}.hs-summary-page .meta{font-size:11px;line-height:1.55;margin-bottom:28px}.hs-summary-page .meta strong{display:inline-block;min-width:92px}.hs-summary-page .stat{text-align:center;font-size:13px;font-weight:700;margin:0 0 28px}.hs-summary-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.hs-summary-page th,.hs-summary-page td{border:.3mm solid #222;padding:6px 4px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}.hs-summary-page th{background:#eee;font-size:8.5px}.hs-summary-page .goods{font-weight:600}.hs-summary-page .totals{margin-top:14px;font-size:11px;font-weight:700;line-height:1.6}@media print{html,body{margin:0;padding:0;background:#fff}.print-toolbar{display:none!important}.hs-summary-page{width:100%;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    const customerName = data.customer?.company || data.customer?.billingName || data.invoice.party;
    const letterhead = linkedLetterhead("hs-code-summary", false);
    const html = `<div class="hs-summary-page" style="position:relative">${letterhead.html}${letterhead.stamp}<h1>DETAILED COMMODITY CLASSIFICATION FORM</h1><div class="meta"><div><strong>Customer Name:</strong> ${escapeHtml(customerName)}</div><div><strong>Delivery Address:</strong> ${escapeHtml(list.deliveryAddress || "—")}</div><div><strong>Date:</strong> ${escapeHtml(list.packingDate)}</div><div><strong>Invoice #:</strong> ${escapeHtml(data.invoice.number)}</div><div><strong>Packing List:</strong> ${escapeHtml(list.number)}</div></div><div class="stat">(FOR STATISTICAL USE)</div><table><colgroup><col style="width:5%"><col style="width:19%"><col style="width:25%"><col style="width:14%"><col style="width:12%"><col style="width:12%"><col style="width:13%"></colgroup><thead><tr><th>#</th><th>COUNTRY OF ORIGIN</th><th>DESCRIPTION OF GOODS</th><th>H.S.CODE</th><th>WEIGHT /KG</th><th>NO. OF UNITS</th><th>VALUE</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div>Total Qty → ${display(totalQty, 2)} PCS</div><div>Total Weight → ${display(totalWeight, 2)} KG(s)</div><div>Total Value → ${totalValue.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}</div></div></div>`;
    return { styles, html };
  }

  function hsSummaryData(list: PackingList) {
    if (!data) return { rows: [] as Array<{ country: string; description: string; hsCode: string; weight: number; units: number; value: number }>, totalQty: 0, totalWeight: 0, totalValue: 0, currency: "AED" };
    const invoiceLines = new Map(data.lines.map((line) => [line.id, line]));
    const grouped = new Map<string, { country: string; description: string; hsCode: string; weight: number; units: number; value: number }>();
    for (const packed of list.lines) {
      const source = invoiceLines.get(packed.invoiceLineId);
      const country = (packed.countryOfOrigin || source?.countryOfOrigin || "—").trim() || "—";
      const description = (packed.description || source?.description || "—").trim() || "—";
      const hsCode = (packed.hsCode || source?.hsCode || "—").trim() || "—";
      const key = [country.toUpperCase(), description.toUpperCase(), hsCode.toUpperCase()].join("|");
      const current = grouped.get(key) ?? { country, description, hsCode, weight: 0, units: 0, value: 0 };
      current.weight += Number(packed.grossWeightKg || 0);
      current.units += Number(packed.packedQuantity || 0);
      current.value += Number(packed.packedQuantity || 0) * Number(source?.unitPrice || 0);
      grouped.set(key, current);
    }
    const rows = [...grouped.values()];
    return {
      rows,
      totalQty: rows.reduce((sum, row) => sum + row.units, 0),
      totalWeight: rows.reduce((sum, row) => sum + row.weight, 0),
      totalValue: rows.reduce((sum, row) => sum + row.value, 0),
      currency: data.invoice.currency || "AED",
    };
  }

  function printHsCodeSummary(list: PackingList) {
    const document = hsCodeSummaryDocument(list);
    if (!document) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the HS Code Summary.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>HS Code Summary - ${escapeHtml(list.number)}</title><style>${document.styles}</style><style>body{margin:0;padding:10mm;background:#fff}.print-toolbar{display:flex;justify-content:flex-end;gap:8px;width:190mm;margin:0 auto 8px}.print-toolbar button{padding:7px 14px}</style></head><body><div class="print-toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${document.html}</body></html>`);
    popup.document.close();
  }

  async function downloadHsCodeSummaryPdf(list: PackingList) {
    const output = hsCodeSummaryDocument(list);
    if (!output) return;
    setHsPdfBusy(true);
    const host = window.document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:190mm;background:#fff;z-index:-1";
    host.innerHTML = `<style>${output.styles}</style>${output.html}`;
    window.document.body.appendChild(host);
    try {
      await window.document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const page = host.querySelector<HTMLElement>(".hs-summary-page");
      if (!page) throw new Error("Could not prepare the HS Code Summary PDF.");
      const blob = await createA4PdfBlob(page, { orientation: "portrait", marginMm: 10, title: `HS Code Summary - ${list.number}` });
      downloadPdfBlob(blob, `${list.number}-HS-Code-Summary.pdf`);
      toast.success("HS Code Summary PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the HS Code Summary PDF.");
    } finally {
      host.remove();
      setHsPdfBusy(false);
    }
  }

  function printList(list: PackingList) {
    const document = packingListDocument(list);
    if (!document) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the packing list.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(list.number)}</title><style>${document.styles}</style><style>body{margin:0;padding:8mm;background:#fff}.print-toolbar{display:flex;justify-content:flex-end;gap:8px;width:281mm;margin:0 auto 8px}.print-toolbar button{padding:7px 14px}</style></head><body><div class="print-toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${document.html}</body></html>`);
    popup.document.close();
  }

  async function downloadListPdf(list: PackingList) {
    const output = packingListDocument(list);
    if (!output) return;
    setPdfBusy(true);
    const host = window.document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:281mm;background:#fff;z-index:-1";
    host.innerHTML = `<style>${output.styles}</style>${output.html}`;
    window.document.body.appendChild(host);
    try {
      await window.document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const page = host.querySelector<HTMLElement>(".packing-page");
      if (!page) throw new Error("Could not prepare the packing list PDF.");
      const blob = await createA4PdfBlob(page, { orientation: "landscape", marginMm: 8, title: list.number });
      downloadPdfBlob(blob, `${list.number}.pdf`);
      toast.success("Packing list PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the packing list PDF.");
    } finally {
      host.remove();
      setPdfBusy(false);
    }
  }

  if (initialView === "hs-summary") {
    const summary = activeList ? hsSummaryData(activeList) : null;
    return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>HS Code Summary · {data?.invoice.number || "Loading…"}</DialogTitle>
          <DialogDescription>Generated from the selected saved Packing List.</DialogDescription>
        </DialogHeader>
        {loading || !data ? <p className="py-16 text-center text-slate-500">Loading HS Code Summary…</p> : <div className="space-y-4">
          {data.packingLists.length === 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Create and save a Packing List first. The HS Code Summary uses its packed quantities and item details.</div> : <>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-slate-50 p-3 dark:bg-slate-900/70">
              <span className="text-sm font-semibold">Packing List:</span>
              {data.packingLists.map((list) => <Button key={list.id} type="button" size="sm" variant={selectedListId === list.id ? "default" : "outline"} onClick={() => setSelectedListId(list.id)}>{list.number} · {display(list.lines.reduce((sum, line) => sum + Number(line.packedQuantity), 0), 2)} pcs</Button>)}
            </div>
            {activeList && summary ? <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><strong>{activeList.number}</strong> · {activeList.packingDate}</div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => printHsCodeSummary(activeList)}><Printer className="size-4" />Print HS Code Summary</Button>
                  <Button type="button" size="sm" variant="outline" disabled={hsPdfBusy} onClick={() => void downloadHsCodeSummaryPdf(activeList)}><Download className="size-4" />{hsPdfBusy ? "Creating PDF…" : "Download HS Summary PDF"}</Button>
                </div>
              </div>
              <div className="hs-summary-preview mx-auto w-full max-w-[1050px] overflow-hidden rounded-xl border border-slate-300 bg-white p-8 text-black shadow-lg">
                <style>{`.hs-summary-preview,.hs-summary-preview *{color:#000!important}.hs-summary-preview{background:#fff!important}.hs-summary-preview table{background:#fff!important}.hs-summary-preview th{background:#f1f5f9!important;color:#000!important;border-color:#111!important}.hs-summary-preview td{background:#fff!important;color:#000!important;border-color:#111!important}.hs-summary-preview strong{color:#000!important}`}</style>
                <p className="text-center text-base font-bold">{companyName}</p>
                <h2 className="mt-2 text-center text-[28px] font-black leading-tight">DETAILED COMMODITY CLASSIFICATION FORM</h2>
                <div className="mt-8 space-y-1.5 text-base leading-6">
                  <div><strong>Customer Name:</strong> {data.customer?.company || data.customer?.billingName || data.invoice.party}</div>
                  <div><strong>Delivery Address:</strong> {activeList.deliveryAddress || "—"}</div>
                  <div><strong>Date:</strong> {activeList.packingDate}</div>
                  <div><strong>Invoice #:</strong> {data.invoice.number}</div>
                  <div><strong>Packing List:</strong> {activeList.number}</div>
                </div>
                <div className="my-9 text-center text-xl font-black">(FOR STATISTICAL USE)</div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[15px]">
                    <thead><tr>{["#","COUNTRY OF ORIGIN","DESCRIPTION OF GOODS","H.S.CODE","WEIGHT /KG","NO. OF UNITS","VALUE"].map((label) => <th key={label} className="border border-black px-3 py-3 text-center text-sm font-black">{label}</th>)}</tr></thead>
                    <tbody>{summary.rows.map((row, index) => <tr key={`${row.country}-${row.description}-${row.hsCode}-${index}`}><td className="border border-black px-3 py-3 text-center">{index + 1}</td><td className="border border-black px-3 py-3 text-center">{row.country}</td><td className="border border-black px-3 py-3 text-center font-semibold">{row.description}</td><td className="border border-black px-3 py-3 text-center">{row.hsCode}</td><td className="border border-black px-3 py-3 text-center">{display(row.weight, 2)}</td><td className="border border-black px-3 py-3 text-center">{display(row.units, 2)}</td><td className="border border-black px-3 py-3 text-center">{row.value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-6 space-y-1.5 text-base font-bold leading-6">
                  <div>Total Qty → {display(summary.totalQty, 2)} PCS</div>
                  <div>Total Weight → {display(summary.totalWeight, 2)} KG(s)</div>
                  <div>Total Value → {summary.totalValue.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {summary.currency}</div>
                </div>
              </div>
            </div> : null}
          </>}
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>;
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>Invoice Packing Lists · {data?.invoice.number || "Loading…"}</DialogTitle><DialogDescription>Select invoice items and pack only the remaining balance. Add another line to split repacked cartons or use the same CTN number for multiple items in one carton.</DialogDescription></DialogHeader>
    {loading || !data ? <p className="py-16 text-center text-slate-500">Loading invoice packing details…</p> : <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm dark:bg-slate-900/70 sm:grid-cols-4"><div><span className="text-slate-500 dark:text-slate-400">Customer</span><strong className="block">{data.invoice.party}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Invoice Qty</span><strong className="block">{display(data.lines.reduce((sum, line) => sum + Number(line.invoicedQuantity), 0), 2)}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Already Packed + Current</span><strong className="block">{display(packedBeforeDraft + totals.quantity, 2)}</strong></div><div><span className="text-slate-500 dark:text-slate-400">Balance After This Packing</span><strong className={`block ${remainingAfterDraft < 0 ? "text-red-600" : "text-amber-700 dark:text-amber-400"}`}>{display(Math.max(0, remainingAfterDraft), 2)}</strong></div></div>
      {data.packingLists.length ? <section className="rounded-xl border"><div className="flex items-center gap-2 border-b p-3"><History className="size-4" /><strong className="text-sm">Saved Packing Lists</strong></div><div className="flex flex-wrap gap-2 p-3">{data.packingLists.map((list) => <Button key={list.id} type="button" size="sm" variant={selectedListId === list.id ? "default" : "outline"} onClick={() => setSelectedListId(list.id)}>{list.number} · {list.lines.reduce((sum, line) => sum + line.packedQuantity, 0)} pcs</Button>)}</div>{activeList ? <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30"><span><CheckCircle2 className="mr-1 inline size-4 text-emerald-600" /><strong>{activeList.number}</strong> · {activeList.packingDate} · {uniqueCartonCount(activeList)} carton(s) · {display(activeList.lines.reduce((sum, line) => sum + line.totalCbm, 0))} m³</span><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => editList(activeList)}><Pencil className="size-4" />Edit</Button><Button type="button" size="sm" variant="outline" onClick={() => printList(activeList)}><Printer className="size-4" />Print Packing List</Button><Button type="button" size="sm" variant="outline" disabled={pdfBusy} onClick={() => void downloadListPdf(activeList)}><Download className="size-4" />{pdfBusy ? "Creating PDF…" : "Packing PDF"}</Button><Button type="button" size="sm" variant="outline" onClick={() => printHsCodeSummary(activeList)}><FileText className="size-4" />Print HS Code Summary</Button><Button type="button" size="sm" variant="outline" disabled={hsPdfBusy} onClick={() => void downloadHsCodeSummaryPdf(activeList)}><Download className="size-4" />{hsPdfBusy ? "Creating HS PDF…" : "HS Summary PDF"}</Button></div></div> : null}</section> : null}
      {editingList ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"><strong>Editing {editingList.number}</strong><Button type="button" size="sm" variant="outline" onClick={cancelEdit}>Cancel Edit</Button></div> : null}
      <section className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-sm"><Label>Packing Date</Label><Input type="date" value={packingDate} onChange={(event) => setPackingDate(event.target.value)} /></label><label className="space-y-1 text-sm sm:col-span-2"><Label>Delivery Address</Label><Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={500} /></label></div>
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[1850px]"><TableHeader><TableRow><TableHead>Select</TableHead><TableHead className="min-w-72">Invoice Item</TableHead><TableHead>Invoice</TableHead><TableHead>Packed</TableHead><TableHead>Balance</TableHead><TableHead className="min-w-28">Pack Qty</TableHead><TableHead className="min-w-28">PCS / CTN</TableHead><TableHead>CTN</TableHead><TableHead className="min-w-28">CTN No</TableHead><TableHead>HS Code</TableHead><TableHead>COO</TableHead><TableHead className="min-w-[430px] text-center">L × W × H cm</TableHead><TableHead className="min-w-28">Gross KG</TableHead><TableHead>CBM</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{drafts.map((draft, draftIndex) => {
              const line = data.lines.find((entry) => entry.id === draft.invoiceLineId);
              if (!line) return null;
              const selected = draft.selected;
              const available = availableQuantity(line);
              const quantity = number(draft.packedQuantity); const units = number(draft.unitsPerCarton);
              const cartons = units > 0 ? Math.ceil(quantity / units) : 0;
              const normalized = cartonReferenceForCount(draft.cartonReference, cartons);
              const keys = normalized.keys;
              const displayedCartons = keys.length || cartons;
              const cbm = number(draft.lengthCm) * number(draft.widthCm) * number(draft.heightCm) / 1_000_000 * displayedCartons;
              const lineBalance = available - (selectedQuantityByLine.get(line.id) ?? 0);
              const invalid = selected && (quantity <= 0 || units <= 0 || keys.length < cartons || lineBalance < -0.000001);
              return <TableRow key={draft.key} className={available <= 0 ? "opacity-55" : invalid ? "bg-red-50 text-red-700 dark:bg-red-950/45 dark:text-red-300" : selected ? "bg-blue-50/60 dark:bg-blue-950/35" : ""}>
                <TableCell><Checkbox className="size-5 border-2 border-slate-500 bg-white shadow-sm data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 dark:border-slate-200 dark:bg-slate-800 dark:data-[state=checked]:border-blue-400 dark:data-[state=checked]:bg-blue-500" disabled={available <= 0} checked={selected} onCheckedChange={(checked) => update(draft.key, { selected: checked === true })} aria-label={`Select packing row ${draftIndex + 1}`} /></TableCell>
                <TableCell>{draft.extra ? <Select value={String(line.id)} onValueChange={(value) => changeLine(draft, Number(value))}><SelectTrigger className="w-full min-w-64"><SelectValue /></SelectTrigger><SelectContent>{data.lines.filter((entry) => availableQuantity(entry) > 0).map((entry) => <SelectItem key={entry.id} value={String(entry.id)}>#{entry.itemNumber || "—"} · {entry.description}</SelectItem>)}</SelectContent></Select> : <><strong>{line.description}</strong><span className="block font-mono text-xs text-slate-500 dark:text-slate-400">#{line.itemNumber || "—"} · {line.sku || "—"}</span></>}</TableCell>
                <TableCell>{display(line.invoicedQuantity, 2)}</TableCell><TableCell>{display(line.packedQuantity, 2)}</TableCell><TableCell className={`font-bold ${lineBalance < 0 ? "text-red-600" : "text-amber-700 dark:text-amber-400"}`}>{display(Math.max(0, lineBalance), 2)}</TableCell>
                <TableCell><Input disabled={!selected} type="number" min="0.01" max={available} step="0.01" value={draft.packedQuantity} onChange={(event) => update(draft.key, { packedQuantity: event.target.value, grossWeightKg: line.unitWeightKg > 0 ? String(Number((line.unitWeightKg * number(event.target.value)).toFixed(3))) : draft.grossWeightKg })} /></TableCell>
                <TableCell><Input disabled={!selected} type="number" min="0.01" step="0.01" value={draft.unitsPerCarton} onChange={(event) => update(draft.key, { unitsPerCarton: event.target.value })} /></TableCell>
                <TableCell className="font-bold">{displayedCartons}</TableCell><TableCell><Input disabled={!selected} value={draft.cartonReference} onChange={(event) => update(draft.key, { cartonReference: event.target.value })} placeholder="1 or 1-3" maxLength={120} /></TableCell>
                <TableCell>{line.hsCode || "—"}</TableCell><TableCell>{line.countryOfOrigin || "—"}</TableCell>
                <TableCell><div className="grid min-w-[400px] grid-cols-3 gap-3">{(["lengthCm", "widthCm", "heightCm"] as const).map((field) => <Input key={field} className="h-14 min-w-[124px] bg-white px-4 text-lg font-bold text-slate-950 md:text-lg dark:bg-slate-800 dark:text-white" disabled={!selected} type="number" min="0" step="0.01" value={draft[field]} onChange={(event) => update(draft.key, { [field]: event.target.value })} aria-label={field} />)}</div></TableCell>
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
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button type="button" disabled={loading || saving || !selectedRows.length} onClick={() => void save()}><PackagePlus className="size-4" />{saving ? "Saving…" : editingListId ? "Update Packing List" : "Save Packing List"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
