"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleOff, Download, Eye, FileText, Paperclip, Pencil, Percent, Plus, Printer, Stamp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LetterheadStamp, type LetterheadCompany } from "@/app/letterhead-page";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { defaultLetterhead } from "@/lib/letterhead";

type VatUsageDocument = { id: number; transactionDate: string; number: string; type: string; party: string; currency: string; total: number };
type VatUsageItem = { id: number; sku: string; name: string; purchaseVatCode: string; salesVatCode: string };
type VatAttachment = { id: number; fileName: string; mimeType: string; fileSize: number; createdAt: string };
export type VatCodeRecord = { id: number; companyId: number; code: string; name: string; rate: number; description: string; active: boolean; system: boolean; documentCount?: number; itemCount?: number; attachmentCount?: number };
type VatForm = { code: string; name: string; rate: string; description: string };
type VatDetail = { code: VatCodeRecord; documents: VatUsageDocument[]; items: VatUsageItem[]; attachments: VatAttachment[] };
const emptyForm: VatForm = { code: "", name: "", rate: "5", description: "" };

function readableType(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function VatCodeCenter({ companyId, company, onChanged, onOpenDocument }: { companyId: number; company: LetterheadCompany; onChanged?: () => void; onOpenDocument?: (id: number) => void }) {
  const [codes, setCodes] = useState<VatCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<VatCodeRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VatForm>(emptyForm);
  const [deleting, setDeleting] = useState<VatCodeRecord | null>(null);
  const [detail, setDetail] = useState<VatDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stamp, setStamp] = useState({ show: Boolean(company.stampData), left: 158, top: 250 });
  const printRef = useRef<HTMLDivElement>(null);

  async function loadCodes() {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/vat-codes?companyId=${companyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load VAT codes");
      setCodes(data.codes);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load VAT codes"); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadCodes(); }, [companyId]);

  function addCode() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function editCode(code: VatCodeRecord) { setEditing(code); setForm({ code: code.code, name: code.name, rate: String(code.rate), description: code.description }); setOpen(true); }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/vat-codes", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...(editing ? { id: editing.id, active: editing.active } : {}), ...form, rate: Number(form.rate) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save VAT code");
      setOpen(false); await loadCodes(); onChanged?.(); toast.success(editing ? "VAT code updated" : "VAT code added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save VAT code"); }
    finally { setSaving(false); }
  }

  async function toggle(code: VatCodeRecord) {
    try {
      const response = await fetch("/api/vat-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: code.id, name: code.name, rate: code.rate, description: code.description, active: !code.active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update VAT code");
      await loadCodes(); onChanged?.(); toast.success(data.record.active ? "VAT code activated" : "VAT code deactivated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update VAT code"); }
  }

  async function removeCode() {
    if (!deleting) return;
    setSaving(true);
    try {
      const response = await fetch("/api/vat-codes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: deleting.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete VAT code");
      setDeleting(null); await loadCodes(); onChanged?.(); toast.success("VAT code deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete VAT code"); }
    finally { setSaving(false); }
  }

  async function openDetail(code: VatCodeRecord) {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/vat-codes?companyId=${companyId}&id=${code.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load VAT-code links");
      setDetail(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load VAT-code links"); }
    finally { setDetailLoading(false); }
  }

  async function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    if (!detail) return;
    const selected = Array.from(event.target.files ?? []).slice(0, Math.max(0, 10 - detail.attachments.length));
    event.target.value = "";
    const attachments = [];
    for (const file of selected) {
      if (file.size > 3_000_000) { toast.error(`${file.name} is larger than 3 MB.`); continue; }
      const fileData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = reject; reader.readAsDataURL(file); });
      attachments.push({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileData, fileSize: file.size });
    }
    if (!attachments.length) return;
    const response = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entityType: "vat_code", entityId: detail.code.id, attachments }) });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Could not save attachments");
    await openDetail(detail.code); await loadCodes(); toast.success("Attachment saved");
  }

  async function deleteAttachment(id: number) {
    if (!detail) return;
    const response = await fetch("/api/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id }) });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Could not delete attachment");
    await openDetail(detail.code); await loadCodes(); toast.success("Attachment deleted");
  }

  function reportData() {
    return { key: "vat-code-register", title: "VAT Code Register", generatedAt: new Date().toISOString(), currency: "AED", period: { label: "Current configuration" }, columns: [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "rate", label: "Rate" }, { key: "status", label: "Status" }, { key: "documents", label: "Documents" }, { key: "items", label: "Items" }, { key: "details", label: "Details" }], rows: codes.map((code) => ({ code: code.code, name: code.name, rate: `${code.rate}%`, status: code.active ? "Active" : "Inactive", documents: code.documentCount ?? 0, items: code.itemCount ?? 0, details: code.description })) };
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      const { reportFilename, reportPdf } = await import("@/lib/report-export");
      const report = reportData();
      const bytes = await reportPdf(report, company.name, "All document areas", report.rows, stamp.show && company.stampData ? { data: company.stampData, left: stamp.left, top: stamp.top } : undefined, "portrait");
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href = url; link.download = reportFilename(report, "pdf"); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare VAT-code PDF"); }
    finally { setExporting(false); }
  }

  function printRegister() {
    const content = printRef.current?.outerHTML;
    if (!content) return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return toast.error("Allow pop-ups to print the VAT Code Register.");
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>VAT Code Register</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;color:#0f172a;font-family:Arial,sans-serif}.vat-register-page{position:relative;width:210mm;min-height:297mm;padding:10mm;background:#fff}.vat-register-table{width:100%;border-collapse:collapse;font-size:10px}.vat-register-table th{background:#102033;color:#fff;text-align:left}.vat-register-table th,.vat-register-table td{border:1px solid #d7dee7;padding:7px;vertical-align:top}.vat-register-table tr:nth-child(even){background:#f4f7fa}.letterhead-stamp{position:absolute}</style></head><body>${content}</body></html>`);
    popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 250);
  }

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">VAT codes</h2><p className="mt-1 text-sm text-muted-foreground">Manage tax choices for {company.name}. Active codes appear on invoices, bills, expenses and item defaults.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setRegisterOpen(true)} disabled={!codes.length}><FileText className="size-4" />A4 register</Button><Button onClick={addCode}><Plus className="size-4" />Add VAT code</Button></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Rate</TableHead><TableHead>Details</TableHead><TableHead>Linked areas</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading VAT codes…</TableCell></TableRow> : codes.map((code) => <TableRow key={code.id}><TableCell><div className="flex items-center gap-2"><span className="font-mono font-semibold">{code.code}</span>{code.system ? <Badge variant="outline">System</Badge> : null}</div></TableCell><TableCell className="font-medium">{code.name}</TableCell><TableCell><Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-200"><Percent className="size-3" />{code.rate.toLocaleString()}%</Badge></TableCell><TableCell className="max-w-sm text-sm text-muted-foreground">{code.description || "—"}</TableCell><TableCell><button type="button" onClick={() => void openDetail(code)} className="text-left text-xs font-medium text-primary hover:underline">{code.documentCount ?? 0} document{code.documentCount === 1 ? "" : "s"} · {code.itemCount ?? 0} item{code.itemCount === 1 ? "" : "s"}{code.attachmentCount ? ` · ${code.attachmentCount} attachment${code.attachmentCount === 1 ? "" : "s"}` : ""}</button></TableCell><TableCell><Badge className={code.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted"}>{code.active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`View ${code.code} links and attachments`} onClick={() => void openDetail(code)}><Eye className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`Edit ${code.code}`} onClick={() => editCode(code)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={code.active ? `Deactivate ${code.code}` : `Activate ${code.code}`} disabled={code.system} title={code.system ? "Standard VAT codes must remain active" : undefined} onClick={() => void toggle(code)}>{code.active ? <CircleOff className="size-4" /> : <BadgeCheck className="size-4" />}</Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete ${code.code}`} disabled={code.system} title={code.system ? "Standard VAT codes cannot be deleted" : undefined} onClick={() => setDeleting(code)}><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}
        {!loading && !codes.length ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No VAT codes configured.</TableCell></TableRow> : null}
      </TableBody></Table></div>
    </section>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Edit VAT code" : "Add VAT code"}</DialogTitle><DialogDescription>Set the code shown in document dropdowns, its calculation rate, and clear usage guidance.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Code</Label><Input value={form.code} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replaceAll(" ", "_") })} placeholder="REDUCED" maxLength={20} required /></div><div className="space-y-2"><Label>Rate (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.rate} disabled={Boolean(editing?.system)} onChange={(event) => setForm({ ...form, rate: event.target.value })} required />{editing?.system ? <p className="text-xs text-muted-foreground">The built-in rate is protected, while its name and details remain editable.</p> : null}</div></div><div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Reduced rate" maxLength={80} required /></div><div className="space-y-2"><Label>Details</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explain when staff should use this VAT code" maxLength={500} rows={4} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save VAT code"}</Button></DialogFooter></form></DialogContent></Dialog>

    <AlertDialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.code}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the custom VAT code and its attachments. Codes already linked to documents or items cannot be deleted; deactivate them instead.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void removeCode(); }}>{saving ? "Deleting…" : "Delete VAT code"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(next) => { if (!next) setDetail(null); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{detail?.code.code || "VAT code"} · linked areas</DialogTitle><DialogDescription>Review every linked document and item, and keep supporting VAT evidence with the code.</DialogDescription></DialogHeader>{detailLoading && !detail ? <p className="py-10 text-center text-muted-foreground">Loading linked records…</p> : detail ? <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Rate</p><p className="mt-1 text-lg font-bold">{detail.code.rate}%</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Documents</p><p className="mt-1 text-lg font-bold">{detail.documents.length}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Items</p><p className="mt-1 text-lg font-bold">{detail.items.length}</p></div></div><section className="rounded-lg border"><div className="border-b px-4 py-3 font-semibold">Documents</div><div className="max-h-56 overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Number</TableHead><TableHead>Party</TableHead><TableHead className="text-right">Open</TableHead></TableRow></TableHeader><TableBody>{detail.documents.length ? detail.documents.map((document) => <TableRow key={document.id}><TableCell>{document.transactionDate}</TableCell><TableCell>{readableType(document.type)}</TableCell><TableCell className="font-mono">{document.number}</TableCell><TableCell>{document.party || "—"}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => { setDetail(null); onOpenDocument?.(document.id); }}><Eye className="size-4" />View</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No posted documents use this code.</TableCell></TableRow>}</TableBody></Table></div></section><section className="rounded-lg border"><div className="border-b px-4 py-3 font-semibold">Item defaults</div><div className="max-h-48 overflow-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Item</TableHead><TableHead>Linked as</TableHead></TableRow></TableHeader><TableBody>{detail.items.length ? detail.items.map((item) => <TableRow key={item.id}><TableCell className="font-mono">{item.sku}</TableCell><TableCell>{item.name}</TableCell><TableCell>{[item.purchaseVatCode === detail.code.code ? "Purchase" : "", item.salesVatCode === detail.code.code ? "Sales" : ""].filter(Boolean).join(" & ")}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No item defaults use this code.</TableCell></TableRow>}</TableBody></Table></div></section><section className="rounded-lg border"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><p className="font-semibold">Attachments</p><p className="text-xs text-muted-foreground">VAT rulings, certificates and supporting files · up to 10 files, 3 MB each.</p></div><Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"><Paperclip className="size-4" />Add files<Input type="file" multiple accept="image/*,.pdf,.csv,.txt,.xls,.xlsx,.doc,.docx" className="sr-only" onChange={(event) => void addAttachments(event)} /></Label></div><div className="space-y-1 p-3">{detail.attachments.length ? detail.attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm"><FileText className="size-4 text-muted-foreground" /><a className="min-w-0 flex-1 truncate font-medium text-primary hover:underline" href={`/api/attachments?companyId=${companyId}&entityType=vat_code&entityId=${detail.code.id}&attachmentId=${attachment.id}`}>{attachment.fileName}</a><span className="text-xs text-muted-foreground">{Math.ceil(attachment.fileSize / 1024)} KB</span><Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete ${attachment.fileName}`} onClick={() => void deleteAttachment(attachment.id)}><Trash2 className="size-4" /></Button></div>) : <p className="py-4 text-center text-sm text-muted-foreground">No attachments saved.</p>}</div></section></div> : null}</DialogContent></Dialog>

    <Dialog open={registerOpen} onOpenChange={setRegisterOpen}><DialogContent className="max-h-[94dvh] overflow-hidden sm:max-w-6xl"><DialogHeader><DialogTitle>VAT Code Register · A4 portrait</DialogTitle><DialogDescription>Review the print layout, add the company stamp if required, drag it into position, then print or download the fitted A4 PDF.</DialogDescription></DialogHeader><div className="flex flex-wrap items-center gap-2"><Button type="button" variant={stamp.show ? "default" : "outline"} disabled={!company.stampData} onClick={() => setStamp({ ...stamp, show: !stamp.show })}><Stamp className="size-4" />{stamp.show ? "Stamp on" : "Stamp off"}</Button><Button type="button" variant="outline" disabled={!company.stampData} onClick={() => setStamp({ show: true, left: 158, top: 250 })}>Reset position</Button><Button type="button" variant="outline" onClick={printRegister}><Printer className="size-4" />Print A4</Button><Button type="button" disabled={exporting} onClick={() => void downloadPdf()}><Download className="size-4" />{exporting ? "Preparing…" : "Download PDF"}</Button>{!company.stampData ? <span className="text-xs text-muted-foreground">Upload a company stamp in Company Setup to enable it.</span> : <span className="text-xs text-muted-foreground">Stamp position {stamp.left} × {stamp.top} mm</span>}</div><div className="min-h-0 overflow-auto rounded-xl border bg-slate-200 p-3 dark:bg-slate-900"><div ref={printRef} className="vat-register-page report-print-surface relative mx-auto min-h-[297mm] w-[210mm] bg-white p-[10mm] text-slate-900 shadow-xl"><header className="border-b-2 border-emerald-600 pb-4"><p className="text-sm font-bold text-emerald-700">{company.name}</p><h3 className="text-2xl font-bold">VAT Code Register</h3><p className="text-xs text-slate-500">Current configuration · A4 portrait · {codes.length} codes</p></header><table className="vat-register-table mt-5 w-full border-collapse text-[10px]"><thead><tr className="bg-slate-900 text-left text-white"><th className="border p-2">Code</th><th className="border p-2">Name</th><th className="border p-2">Rate</th><th className="border p-2">Status</th><th className="border p-2">Linked areas</th><th className="border p-2">Details</th></tr></thead><tbody>{codes.map((code) => <tr key={code.id} className="even:bg-slate-50"><td className="border p-2 font-mono font-bold">{code.code}</td><td className="border p-2">{code.name}</td><td className="border p-2">{code.rate}%</td><td className="border p-2">{code.active ? "Active" : "Inactive"}</td><td className="border p-2">{code.documentCount ?? 0} documents · {code.itemCount ?? 0} items</td><td className="border p-2">{code.description || "—"}</td></tr>)}</tbody></table><p className="mt-4 text-[9px] text-slate-500">Generated {new Date().toLocaleString("en-AE")} · VAT codes are linked to invoices, bills, expenses, purchase returns and item tax defaults.</p>{stamp.show && <LetterheadStamp template={{ ...defaultLetterhead(), showStamp: true, stampLeft: stamp.left, stampTop: stamp.top }} company={company} maxLeft={178} maxTop={274} onMove={(left, top) => setStamp({ show: true, left, top })} />}</div></div></DialogContent></Dialog>
  </div>;
}
