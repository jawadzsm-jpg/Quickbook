"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FilePlus2, Pencil, Printer, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createA4LetterheadPdfBlob, downloadPdfBlob } from "@/lib/document-output";
import { defaultLetterhead, letterheadForDocument } from "@/lib/letterhead";
import { LetterheadBrand, LetterheadStamp, type LetterheadCompany } from "./letterhead-page";
import { toast } from "sonner";

type Company = LetterheadCompany & { letterheadDesign?: string; documentColor?: string };
type Customer = { id: number; name: string; company: string; phone: string; email: string };
type Invoice = { id: number; number: string; party: string; transactionDate: string };
type InvoiceLine = { id: number; description: string; serialNumber: string; itemName: string | null; specifications: string | null };
type Slip = {
  id?: number; number?: string; updatedAt?: string; customerId: number; invoiceId: number | null; invoiceLineId: number | null;
  slipDate: string; contactName: string; contactPhone: string; contactEmail: string; customerReference: string;
  invoiceNumber: string; brand: string; model: string; specs: string; serialNumber: string;
  problem: string; remarks: string; includedItems: string; status: string; showStamp: boolean; stampLeft: number; stampTop: number;
  customerName?: string; createdBy?: string;
  customerCompany?: string;
};
const emptySlip = (stamp = false, left = 156, top = 242): Slip => ({
  customerId: 0, invoiceId: null, invoiceLineId: null, slipDate: new Date().toLocaleDateString("en-CA"),
  contactName: "", contactPhone: "", contactEmail: "", customerReference: "", invoiceNumber: "", brand: "", model: "",
  specs: "", serialNumber: "", problem: "", remarks: "", includedItems: "", status: "Under Process",
  showStamp: stamp, stampLeft: left, stampTop: top,
});
const fieldClass = "grid gap-1 text-sm font-semibold text-slate-700";
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm font-normal";
const printable = (value: string) => value.trim() || "—";
function itemSpecs(value: string | null, fallback: string) {
  try {
    const entries = JSON.parse(value || "[]") as Array<{ label?: string; value?: string }>;
    const result = entries.filter((entry) => entry.value && entry.value.toLocaleLowerCase() !== "no").map((entry) => [entry.label, entry.value].filter(Boolean).join(": ")).join(" · ");
    return result || fallback;
  } catch { return fallback; }
}

export function WarrantyCenter({ companyId, company, canWrite }: { companyId: number; company: Company; canWrite: boolean }) {
  const letterhead = letterheadForDocument(company.letterheadDesign, "warranty-slip");
  const stampDefault = letterhead?.showStamp ?? Boolean(company.stampData);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [form, setForm] = useState<Slip>(() => emptySlip(stampDefault, letterhead?.stampLeft, letterhead?.stampTop));
  const [saved, setSaved] = useState<Slip | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [inlineEdits, setInlineEdits] = useState<Record<number, { status: string; remarks: string }>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const page = useRef<HTMLElement>(null);
  const activeLetterhead = { ...defaultLetterhead(), ...letterhead, color: letterhead?.color || company.documentColor || "#0f766e", showStamp: form.showStamp, stampLeft: form.stampLeft, stampTop: form.stampTop };
  const selectedCustomer = customers.find((row) => row.id === form.customerId);
  const dirty = Boolean(saved) ? JSON.stringify(form) !== JSON.stringify(saved) : Boolean(form.customerId || form.problem || form.brand || form.model || form.remarks);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/warranty-slips?companyId=${companyId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load warranty slips.");
    setSlips(result.slips); setCustomers(result.customers); setInvoices(result.invoices);
  }, [companyId]);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(refresh).catch((error) => { if (live) toast.error(error instanceof Error ? error.message : "Could not load warranty slips."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refresh]);

  async function loadInvoice(invoiceId: number | null) {
    if (!invoiceId) { setLines([]); return; }
    try {
      const response = await fetch(`/api/warranty-slips?companyId=${companyId}&invoiceId=${invoiceId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load invoice items.");
      setLines(result.lines);
    } catch (error) { setLines([]); toast.error(error instanceof Error ? error.message : "Could not load invoice items."); }
  }
  function openSlip(slip: Slip) {
    if (dirty && showForm && !window.confirm("Discard unsaved warranty changes?")) return;
    setForm(slip); setSaved(slip); setShowForm(true); void loadInvoice(slip.invoiceId);
  }
  function createSlip() {
    if (dirty && showForm && !window.confirm("Discard unsaved warranty changes?")) return;
    setForm(emptySlip(stampDefault, letterhead?.stampLeft, letterhead?.stampTop));
    setSaved(null); setLines([]); setShowForm(true);
  }
  function backToList() {
    if (dirty && !window.confirm("Discard unsaved warranty changes?")) return;
    setShowForm(false); setSaved(null);
  }
  function update<K extends keyof Slip>(key: K, value: Slip[K]) { setForm((previous) => ({ ...previous, [key]: value })); }
  async function save() {
    if (!form.customerId || !form.slipDate || !form.problem.trim()) return toast.error("Select a customer, date and problem.");
    setBusy(true);
    try {
      const response = await fetch("/api/warranty-slips", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, companyId, revision: saved?.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the warranty slip.");
      setForm(result.slip); setSaved(result.slip); await refresh();
      toast.success(`${result.slip.number} saved`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the warranty slip."); }
    finally { setBusy(false); }
  }
  async function saveInline(slip: Slip) {
    if (!slip.id || !inlineEdits[slip.id]) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warranty-slips", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...slip, ...inlineEdits[slip.id], companyId, id: slip.id, revision: slip.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update warranty status.");
      setInlineEdits((previous) => { const next = { ...previous }; delete next[slip.id!]; return next; });
      await refresh(); toast.success("Warranty status saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update warranty status."); }
    finally { setBusy(false); }
  }
  function checkPage() {
    if (!page.current || page.current.scrollHeight > page.current.clientHeight + 2) { toast.error("The slip exceeds one A4 page. Shorten the text before printing."); return false; }
    return true;
  }
  function print() {
    if (!checkPage() || !page.current) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the warranty slip.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Warranty Slip</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif}*{box-sizing:border-box}.warranty-page{width:210mm!important;height:297mm!important;margin:0!important;border:0!important;box-shadow:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.letterhead-stamp{cursor:default!important}.print-controls{padding:10px}@media print{.print-controls{display:none}}</style></head><body><div class="print-controls"><button onclick="window.print()">Print</button></div>${page.current.outerHTML}</body></html>`);
    popup.document.close();
    void Promise.all(Array.from(popup.document.images).map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
      .then(() => window.setTimeout(() => { if (!popup.closed) popup.print(); }, 150));
  }
  async function pdf() {
    if (!checkPage() || !page.current) return;
    setBusy(true);
    try { downloadPdfBlob(await createA4LetterheadPdfBlob(page.current, `Warranty Slip ${form.number || "Draft"}`), `${form.number || "Warranty-Slip"}.pdf`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the PDF."); }
    finally { setBusy(false); }
  }
  const customerInvoices = invoices.filter((invoice) => invoice.party.trim().toLocaleLowerCase() === selectedCustomer?.name.trim().toLocaleLowerCase());
  const filtered = slips.filter((slip) => [slip.number, slip.customerName, slip.customerCompany, slip.contactName, slip.invoiceNumber, slip.brand, slip.model, slip.serialNumber, slip.status].some((value) => String(value || "").toLocaleLowerCase().includes(search.toLocaleLowerCase())));

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5"><div><h2 className="text-lg font-bold">Warranty Slips</h2><p className="text-sm text-slate-500">Customer warranty intake, status and printable A4 slips</p></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={backToList} disabled={!showForm}>Warranty list</Button>{canWrite && <Button type="button" onClick={createSlip}><FilePlus2 className="size-4" />New warranty slip</Button>}</div></div>
    {!showForm ? <div className="rounded-xl border bg-white p-5"><label className="mb-4 flex max-w-sm items-center gap-2 rounded-md border px-3"><Search className="size-4 text-slate-400" /><Input className="border-0 shadow-none" placeholder="Search customer, invoice, serial or status" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-sm"><thead className="bg-slate-50 text-left"><tr>{["Date", "Slip #", "Company", "Name", "Invoice #", "Brand / Model", "Status", "Remark", "Created by", "Open"].map((heading) => <th key={heading} className="border px-3 py-2">{heading}</th>)}</tr></thead><tbody>{filtered.map((slip) => <tr key={slip.id}><td className="border px-3 py-2">{slip.slipDate}</td><td className="border px-3 py-2 font-semibold">{slip.number}</td><td className="border px-3 py-2">{slip.customerCompany || slip.customerName}</td><td className="border px-3 py-2">{slip.contactName || slip.customerName}</td><td className="border px-3 py-2">{slip.invoiceNumber || "—"}</td><td className="border px-3 py-2">{[slip.brand, slip.model].filter(Boolean).join(" · ") || "—"}</td><td className="border px-3 py-2"><select className={selectClass} value={inlineEdits[slip.id!]?.status ?? slip.status} disabled={!canWrite} onChange={(event) => setInlineEdits((old) => ({ ...old, [slip.id!]: { status: event.target.value, remarks: old[slip.id!]?.remarks ?? slip.remarks } }))}>{["Under Process", "Completed", "Returned"].map((status) => <option key={status}>{status}</option>)}</select></td><td className="border px-3 py-2"><Input value={inlineEdits[slip.id!]?.remarks ?? slip.remarks} disabled={!canWrite} maxLength={2000} onChange={(event) => setInlineEdits((old) => ({ ...old, [slip.id!]: { status: old[slip.id!]?.status ?? slip.status, remarks: event.target.value } }))} /></td><td className="border px-3 py-2">{slip.createdBy || "—"}</td><td className="border px-3 py-2"><div className="flex gap-1">{inlineEdits[slip.id!] && <Button type="button" size="sm" disabled={busy} onClick={() => void saveInline(slip)}><Save className="size-3" />Save</Button>}<Button type="button" size="sm" variant="outline" onClick={() => openSlip(slip)}><Pencil className="size-3" />Open / Print</Button></div></td></tr>)}</tbody></table>{!filtered.length && <p className="py-7 text-center text-sm text-slate-500">{loading ? "Loading warranty slips…" : "No matching warranty slips."}</p>}</div></div> : <>
      <div className="space-y-5 rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{form.number || "New warranty slip"}</h3><p className="text-sm text-slate-500">Choose an invoice to link the customer and item automatically, or enter warranty details manually.</p></div><div className="flex gap-2">{canWrite && <Button type="button" disabled={busy} onClick={() => void save()}><Save className="size-4" />Save slip</Button>}<Button type="button" variant="outline" onClick={print}><Printer className="size-4" />Print A4</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void pdf()}><Download className="size-4" />PDF A4</Button></div></div>
        <div className="grid gap-4 md:grid-cols-2"><label className={fieldClass}>Customer<select className={selectClass} value={form.customerId || ""} disabled={!canWrite} onChange={(event) => { const id = Number(event.target.value); const customer = customers.find((row) => row.id === id); setForm((old) => ({ ...old, customerId: id, contactName: customer?.name || "", contactPhone: customer?.phone || "", contactEmail: customer?.email || "", invoiceId: null, invoiceLineId: null, invoiceNumber: "" })); setLines([]); }}><option value="">Select customer</option>{customers.map((row) => <option key={row.id} value={row.id}>{row.name}{row.company ? ` · ${row.company}` : ""}</option>)}</select></label><label className={fieldClass}>Received date<Input type="date" value={form.slipDate} disabled={!canWrite} onChange={(event) => update("slipDate", event.target.value)} /></label>
          <label className={fieldClass}>Customer name<Input maxLength={120} value={form.contactName} disabled={!canWrite} onChange={(event) => update("contactName", event.target.value)} /></label><label className={fieldClass}>Contact phone<Input maxLength={80} value={form.contactPhone} disabled={!canWrite} onChange={(event) => update("contactPhone", event.target.value)} /></label><label className={fieldClass}>Email<Input type="email" maxLength={160} value={form.contactEmail} disabled={!canWrite} onChange={(event) => update("contactEmail", event.target.value)} /></label><label className={fieldClass}>Customer ID / reference<Input maxLength={100} value={form.customerReference} disabled={!canWrite} onChange={(event) => update("customerReference", event.target.value)} /></label>
          <label className={fieldClass}>Customer invoice<select className={selectClass} value={form.invoiceId || ""} disabled={!canWrite || !form.customerId} onChange={(event) => { const id = Number(event.target.value) || null; const invoice = customerInvoices.find((row) => row.id === id); setForm((old) => ({ ...old, invoiceId: id, invoiceLineId: null, invoiceNumber: invoice?.number || "" })); void loadInvoice(id); }}><option value="">No linked invoice</option>{customerInvoices.map((row) => <option key={row.id} value={row.id}>{row.number} · {row.transactionDate}</option>)}</select></label><label className={fieldClass}>Invoice #<Input maxLength={100} value={form.invoiceNumber} disabled={!canWrite || Boolean(form.invoiceId)} onChange={(event) => update("invoiceNumber", event.target.value)} /></label>
          {form.invoiceId && <label className={fieldClass}>Invoice item<select className={selectClass} value={form.invoiceLineId || ""} disabled={!canWrite} onChange={(event) => { const id = Number(event.target.value) || null; const line = lines.find((row) => row.id === id); setForm((old) => ({ ...old, invoiceLineId: id, model: line?.itemName || line?.description || old.model, serialNumber: line?.serialNumber || old.serialNumber, specs: line ? itemSpecs(line.specifications, line.description) : old.specs })); }}><option value="">Select an invoiced item</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.itemName || line.description}{line.serialNumber ? ` · SN ${line.serialNumber}` : ""}</option>)}</select></label>}
          <label className={fieldClass}>Brand<Input maxLength={120} value={form.brand} disabled={!canWrite} onChange={(event) => update("brand", event.target.value)} /></label><label className={fieldClass}>Model<Input maxLength={200} value={form.model} disabled={!canWrite} onChange={(event) => update("model", event.target.value)} /></label><label className={fieldClass}>Specifications<Input maxLength={1000} value={form.specs} disabled={!canWrite} onChange={(event) => update("specs", event.target.value)} /></label><label className={fieldClass}>Serial number<Input maxLength={200} value={form.serialNumber} disabled={!canWrite} onChange={(event) => update("serialNumber", event.target.value)} /></label>
          <label className={fieldClass}>Status<select className={selectClass} value={form.status} disabled={!canWrite} onChange={(event) => update("status", event.target.value)}>{["Under Process", "Completed", "Returned"].map((status) => <option key={status}>{status}</option>)}</select></label>
        </div><div className="grid gap-4"><label className={fieldClass}>Problem <span className="text-red-600">*</span><Textarea rows={3} maxLength={2000} value={form.problem} disabled={!canWrite} onChange={(event) => update("problem", event.target.value)} /></label><label className={fieldClass}>Remarks<Textarea rows={2} maxLength={2000} value={form.remarks} disabled={!canWrite} onChange={(event) => update("remarks", event.target.value)} /></label><label className={fieldClass}>Included items / accessories<Input maxLength={1000} value={form.includedItems} disabled={!canWrite} onChange={(event) => update("includedItems", event.target.value)} /></label></div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-slate-50 p-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.showStamp} disabled={!canWrite || !company.stampData} onChange={(event) => update("showStamp", event.target.checked)} />Show company stamp</label>{form.showStamp && company.stampData && <><span className="text-xs text-slate-500">Drag the stamp on the A4 preview or enter its position.</span><label className={fieldClass}>Left (mm)<Input type="number" min={0} max={170} className="w-24" value={form.stampLeft} disabled={!canWrite} onChange={(event) => update("stampLeft", Math.min(170, Math.max(0, Number(event.target.value) || 0)))} /></label><label className={fieldClass}>Top (mm)<Input type="number" min={0} max={260} className="w-24" value={form.stampTop} disabled={!canWrite} onChange={(event) => update("stampTop", Math.min(260, Math.max(0, Number(event.target.value) || 0)))} /></label></>}</div>
        {dirty && <p className="text-xs font-medium text-amber-700">Unsaved changes. Save the slip to keep these details and stamp position.</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-slate-100 p-3"><article ref={page} className="letterhead-page warranty-page relative mx-auto bg-white text-slate-900 shadow" style={{ width: "210mm", height: "297mm", padding: "13mm", boxSizing: "border-box", overflow: "hidden", fontFamily: "Arial,sans-serif", fontSize: 12, lineHeight: 1.4 }}><LetterheadBrand template={activeLetterhead} company={company} /><header style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid", borderColor: activeLetterhead.color, paddingBottom: 10, marginBottom: 14 }}><div><h2 style={{ margin: 0, fontSize: 22, color: activeLetterhead.color }}>WARRANTY SLIP</h2><small>Customer service · Goods received</small></div><div style={{ textAlign: "right" }}><strong>{form.number || "DRAFT"}</strong><div>{form.slipDate}</div></div></header>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}><div><strong>Customer</strong><p>{printable(selectedCustomer?.name || form.customerName || "")}</p></div><div><strong>Contact name</strong><p>{printable(form.contactName)}</p></div><div><strong>Phone</strong><p>{printable(form.contactPhone)}</p></div><div><strong>Email</strong><p>{printable(form.contactEmail)}</p></div><div><strong>Customer ID</strong><p>{printable(form.customerReference)}</p></div><div><strong>Invoice #</strong><p>{printable(form.invoiceNumber)}</p></div></div>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", marginBottom: 16 }}><tbody>{[["Brand", form.brand], ["Model", form.model], ["Specifications", form.specs], ["Serial #", form.serialNumber], ["Problem", form.problem], ["Remarks", form.remarks], ["Included items", form.includedItems], ["Status", form.status]].map(([label, value]) => <tr key={label}><th style={{ width: "29%", padding: 9, border: "1px solid #cbd5e1", background: "#f8fafc", textAlign: "left", verticalAlign: "top" }}>{label}</th><td style={{ padding: 9, border: "1px solid #cbd5e1", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{printable(value)}</td></tr>)}</tbody></table>
          <div className="letterhead-footer-area" style={{ position: "absolute", left: "13mm", right: "13mm", bottom: "12mm", borderTop: "1px solid #cbd5e1", paddingTop: 9, color: "#475569", fontSize: 11 }}><p style={{ margin: "0 0 5px" }}>Received by: ____________________　 Customer signature: ____________________</p>{activeLetterhead.footer ? <p style={{ margin: 0 }}>{activeLetterhead.footer}</p> : <p style={{ margin: 0 }}>{company.name} · Warranty service record</p>}</div>
          <LetterheadStamp template={activeLetterhead} company={company} onMove={canWrite ? (left, top) => setForm((old) => ({ ...old, stampLeft: left, stampTop: top })) : undefined} />
        </article></div><Button type="button" variant="outline" onClick={backToList}>Back to warranty list</Button>
    </>}
  </section>;
}
