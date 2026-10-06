"use client";

import { DocumentExtraFields, type DocumentExtra } from "./document-extra-fields";
import { InvoiceAttachments } from "./invoice-attachments";
import { useEffect, useState } from "react";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save } from "lucide-react";

type ReceiptLine = { id: number; description: string; quantity: number; received: number; remaining: number; unitPrice: number; vatCode: string; vatRate: number };
type PendingFile = { fileName: string; mimeType: string; fileData: string; fileSize: number };
type VatChoice = { code: string; label: string; rate: number };
export function PurchaseOrderReceiving({ orderId, companyId, onSaved, documentType = "item receipt", account, defaultNumber = "", salesReps = [], vatCodes = [] }: { orderId: number; companyId: number; onSaved: () => void; documentType?: "item receipt" | "bill"; account?: string; defaultNumber?: string; salesReps?: string[]; vatCodes?: VatChoice[] }) {
  const [data, setData] = useState<{ order: { locationId: number; number: string; status: string; currency: string; memo: string | null; salesman: string | null }; lines: ReceiptLine[]; locations: { id: number; name: string }[] }>();
  const isBill = documentType === "bill";
  const [number, setNumber] = useState(defaultNumber);
  const [salesman, setSalesman] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [activeLines, setActiveLines] = useState<number[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState(0);
  const [memo, setMemo] = useState("");
  const [lineExtras, setLineExtras] = useState<Record<number, DocumentExtra>>({});
  const [extra, setExtra] = useState({ comments: "", serialNumber: "" });
  const [billOfEntryNumber, setBillOfEntryNumber] = useState("");
  const [airwayBillNumber, setAirwayBillNumber] = useState("");
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/records?kind=po-receiving&companyId=' + companyId + '&orderId=' + orderId, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load purchase order.");
      if (controller.signal.aborted) return;
      setData(result);
      setLocationId(result.order.locationId);
      setSalesman(String(result.order.salesman ?? ""));
      // One VAT code per bill: start from the purchase order's first line.
      setVatCode(String(result.lines.find((line: ReceiptLine) => line.remaining > 0)?.vatCode ?? result.lines[0]?.vatCode ?? ""));
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [companyId, orderId]);
  const skuLock = useSkuLock(data ? { resource: "records", kind: "transactions", companyId, locationId: locationId, purchaseOrderId: orderId, lines: data.lines.filter((line) => Number(quantities[line.id]) > 0 || activeLines.includes(line.id)).map((line) => ({ orderLineId: line.id })) } : null);
  const lineVat = (line: ReceiptLine) => isBill && vatCode ? { code: vatCode, rate: vatCodes.find((option) => option.code === vatCode)?.rate ?? line.vatRate } : { code: line.vatCode, rate: line.vatRate };
  const hasImportGoodsVat = isBill && Boolean(data?.lines.some((line) => lineVat(line).code === "IMPORT_GOODS" && line.remaining > 0));
  const usesImportGoodsVat = hasImportGoodsVat && Boolean(data?.lines.some((line) => lineVat(line).code === "IMPORT_GOODS" && Number(quantities[line.id]) > 0));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!skuLock.ready) return;
    if (!data || saving) return;
    if (!data.locations.some((location) => location.id === locationId)) return setError("Select a receiving inventory.");
    const lines = data.lines.filter((line) => Number(quantities[line.id]) > 0).map((line) => ({ orderLineId: line.id, quantity: Number(quantities[line.id]), ...(documentType === "bill" ? lineExtras[line.id] : {}) }));
    if (!lines.length) return setError("Enter the quantities received on at least one line.");
    if (isBill && !number.trim()) return setError("Enter the bill reference number.");
    if (usesImportGoodsVat && (!billOfEntryNumber.trim() || !airwayBillNumber.trim())) return setError("Enter the Bill of Entry No. and Airway Bill No. for imported goods.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify({ kind: "transactions", type: documentType, account, companyId, locationId, purchaseOrderId: orderId, transactionDate: date, memo, ...extra, billOfEntryNumber, airwayBillNumber, lines, ...(isBill ? { number: number.trim(), salesman, vatCode } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create item receipt.");
      let attachmentError = "";
      if (usesImportGoodsVat && attachments.length) {
        try {
          const upload = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entityType: "transaction", entityId: result.record.id, attachments }) });
          if (!upload.ok) attachmentError = (await upload.json()).error || "Upload failed.";
        } catch (cause) { attachmentError = cause instanceof Error ? cause.message : "Upload failed."; }
      }
      if (attachmentError) toast.error(`Bill saved, but attachments failed: ${attachmentError} Open the bill to add them again.`);
      else toast.success(`${documentType === "bill" ? "Bill" : "Item receipt"} saved. The PO keeps any remaining quantities.`);
      setActiveLines([]);
      setQuantities({});
      setLineExtras({});
      setAttachments([]);
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create item receipt."); }
    finally { setSaving(false); }
  }
  return <section className="document-internal-only rounded-xl border bg-card text-card-foreground p-4">
    <h3 className="font-semibold">{documentType === "bill" ? "Enter bill for items received" : "Receive items from this purchase order"}</h3>
    <p className="mt-1 text-sm text-muted-foreground">Enter only the quantities delivered now. Remaining quantities stay on this PO for the next receipt.</p>
    <SkuLockNotice message={skuLock.message} />
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {!data ? <p className="mt-3 text-sm">{error ? "Close and reopen the purchase order to retry." : "Loading quantities…"}</p> : <form onSubmit={save} className="mt-4 grid gap-4">
      {isBill && <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm">Reference No. *<Input required maxLength={80} disabled={saving} value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Supplier bill / invoice no." /></label>
        <label className="grid gap-2 text-sm">Sales Rep<select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" disabled={saving} value={salesman} onChange={(event) => setSalesman(event.target.value)}><option value="">No sales rep</option>{[...new Set([...(salesman ? [salesman] : []), ...salesReps])].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="grid gap-2 text-sm">VAT code *<select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" required disabled={saving} value={vatCode} onChange={(event) => setVatCode(event.target.value)}>{vatCode && !vatCodes.some((option) => option.code === vatCode) && <option value={vatCode}>{vatCode}</option>}{vatCodes.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">{documentType === "bill" ? "Bill date" : "Receipt date"}<Input type="date" required disabled={saving} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="grid gap-2 text-sm">Receiving inventory<select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" required disabled={saving} value={locationId || ""} onChange={(event) => { setLocationId(Number(event.target.value)); setLineExtras({}); }}><option value="" disabled>Select inventory</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      </div>
      <div className="grid gap-3">{data.lines.map((line) => <article key={line.id} className="min-w-0 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{line.description}</h4><p className="text-sm tabular-nums"><span className="text-muted-foreground">Unit price · </span>{data.order.currency} {line.unitPrice.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p></div>
        <div className="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-4">{[["Ordered", line.quantity], ["Received", line.received], ["Remaining", line.remaining]].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all font-medium tabular-nums">{value}</p></div>)}<label className="grid min-w-0 gap-2 text-xs text-muted-foreground">Receive now<Input className="min-w-0 text-right text-foreground tabular-nums" aria-label={'Receive ' + line.description} type="number" min="0" max={line.remaining} step="any" disabled={skuLock.blocked || saving || line.remaining <= 0} onFocus={() => setActiveLines((old) => old.includes(line.id) ? old : [...old, line.id])} value={quantities[line.id] || ""} placeholder="0" onChange={(event) => setQuantities((old) => ({ ...old, [line.id]: event.target.value }))} /></label></div>
        {documentType === "bill" && Number(quantities[line.id]) > 0 && <div className="mt-4 border-t pt-3"><DocumentExtraFields value={lineExtras[line.id] || { comments: "", serialNumber: "" }} onChange={value => setLineExtras(old => ({ ...old, [line.id]: value }))} disabled={saving} /></div>}
      </article>)}</div>
      {documentType === "bill" && <div className="rounded-md border p-3 text-sm"><p>Prices are taken from the purchase order; the VAT code above applies to every line.</p><p className="mt-2 font-bold">Bill total: {data.order.currency} {data.lines.reduce((sum, line) => sum + Number((Number(quantities[line.id] || 0) * line.unitPrice).toFixed(2)) + Number((Number((Number(quantities[line.id] || 0) * line.unitPrice).toFixed(2)) * lineVat(line).rate / 100).toFixed(2)), 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>}
      {hasImportGoodsVat && <section className="grid gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-2 dark:border-sky-900 dark:bg-sky-950/30"><div className="sm:col-span-2"><h4 className="font-semibold">UAE import documents</h4><p className="mt-1 text-xs text-muted-foreground">This purchase order uses the Goods imported into the UAE VAT code. Bill of Entry No. and Airway Bill No. are required when an import line is included in this bill.</p></div><label className="grid gap-2 text-sm">Bill of Entry No.{usesImportGoodsVat ? " *" : ""}<Input required={usesImportGoodsVat} maxLength={120} value={billOfEntryNumber} onChange={(event) => setBillOfEntryNumber(event.target.value)} placeholder="Enter Bill of Entry number" /></label><label className="grid gap-2 text-sm">Airway Bill No.{usesImportGoodsVat ? " *" : ""}<Input required={usesImportGoodsVat} maxLength={120} value={airwayBillNumber} onChange={(event) => setAirwayBillNumber(event.target.value)} placeholder="Enter Airway Bill number" /></label></section>}
      {hasImportGoodsVat && <InvoiceAttachments companyId={companyId} pending={attachments} onPendingChange={setAttachments} documentLabel="Bill" />}
      {documentType === "bill" && <DocumentExtraFields value={extra} onChange={setExtra} disabled={saving} />}
      <label className="grid gap-2 text-sm">{documentType === "bill" ? "Additional bill notes" : "Receipt memo"}<Input disabled={saving} value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      {documentType === "bill" && <label className="grid gap-2 text-sm">Bill memo<textarea readOnly className="min-h-20 w-full rounded-md border bg-background p-3" value={[data.order.memo, memo, `Received from PO ${data.order.number}`].filter(Boolean).join(" · ")} /><span className="text-muted-foreground">The purchase order number is included automatically when you save.</span></label>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setQuantities(Object.fromEntries(data.lines.map((line) => [line.id, String(line.remaining)])))}>Fill remaining quantities</Button><Button disabled={!skuLock.ready || saving || !data.lines.some((line) => line.remaining > 0)} type="submit"><Save className="size-4" />{saving ? "Saving…" : documentType === "bill" ? "Save Bill" : "Save Receipt"}</Button></div>
    </form>}
  </section>;
}
