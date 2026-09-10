"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Printer, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ReportRecord = { id: number; companyId: number; locationId: number; memo: string; createdAt: string; updatedAt: string; creator: string | null; creatorEmail: string | null; locationName: string };
type ReportLine = { id: number; itemNumber: string; sku: string; itemName: string; systemQuantity: number; countedQuantity: number | null };

const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const quantity = (value: number) => Number(value).toLocaleString("en-AE", { maximumFractionDigits: 2 });

export function InventoryCheckReports({ companyId, companyName, locationId, locationName, canManage, currentUserName }: { companyId: number; companyName: string; locationId: number; locationName: string; canManage: boolean; currentUserName: string }) {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [newMemo, setNewMemo] = useState("");
  const [detail, setDetail] = useState<ReportRecord | null>(null);
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReportRecord | null>(null);

  const loadReports = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/inventory-check-reports?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load inventory check reports");
      setRecords(data.records as ReportRecord[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load inventory check reports"); }
    finally { setLoading(false); }
  }, [companyId, locationId]);

  // Refresh whenever the selected company inventory changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadReports(); }, [loadReports]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => [record.id, record.memo, record.creator, record.creatorEmail, record.locationName].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [records, search]);
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const visible = filtered.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);

  async function createReport(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/inventory-check-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, locationId, memo: newMemo }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create inventory check report");
      setCreateOpen(false); setNewMemo(""); await loadReports(); toast.success(`Inventory check report #${data.record.id} created`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create inventory check report"); }
    finally { setSaving(false); }
  }

  async function openReport(record: ReportRecord, edit = false) {
    setDetail(record); setEditing(edit && canManage); setDetailLoading(true); setLines([]);
    try {
      const response = await fetch(`/api/inventory-check-reports?companyId=${companyId}&reportId=${record.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open inventory check report");
      setLines(data.lines as ReportLine[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open inventory check report"); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  async function saveReport() {
    if (!detail || !canManage) return; setSaving(true);
    try {
      const response = await fetch("/api/inventory-check-reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: detail.id, memo: detail.memo, lines: lines.map((line) => ({ id: line.id, countedQuantity: line.countedQuantity })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save inventory check report");
      setEditing(false); await loadReports(); toast.success(`Report #${detail.id} saved`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save inventory check report"); }
    finally { setSaving(false); }
  }

  async function deleteReport() {
    if (!deleteTarget || !canManage) return; setSaving(true);
    try {
      const response = await fetch("/api/inventory-check-reports", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: deleteTarget.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete inventory check report");
      setDeleteTarget(null); await loadReports(); toast.success("Inventory check report deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete inventory check report"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white"><ClipboardList className="size-5" /></div><div><h2 className="font-bold text-slate-900">Inventory Check Reports</h2><p className="text-sm text-slate-500">{companyName} · {locationName}</p></div></div><div className="flex items-center gap-2"><Badge variant="outline" className="bg-white"><Users className="mr-1 size-3.5" />{records.length} reports</Badge><Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />New report</Button></div></div>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-2 text-sm text-slate-600"><span>Show</span><Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select><span>entries</span></div><div className="relative w-full md:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by memo, report number or creator" className="pl-9" /></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Report Date</TableHead><TableHead>Report #</TableHead><TableHead className="min-w-72">Memo</TableHead><TableHead>Creator</TableHead><TableHead>Inventory</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-500">Loading inventory check reports…</TableCell></TableRow> : visible.length ? visible.map((record) => <TableRow key={record.id}><TableCell><span className="font-semibold text-rose-600">{formatDate(record.createdAt).split(",")[0]}</span><span className="block text-xs text-slate-500">{formatDate(record.createdAt).split(",").slice(1).join(",").trim()}</span></TableCell><TableCell className="font-mono font-semibold">{record.id}</TableCell><TableCell>{record.memo || <span className="text-slate-400">No memo</span>}</TableCell><TableCell className="font-semibold">{record.creator || record.creatorEmail || "Unknown"}</TableCell><TableCell>{record.locationName}</TableCell><TableCell><div className="flex justify-end gap-2"><Button type="button" size="icon" variant="outline" className="border-amber-300 text-amber-600" onClick={() => void openReport(record)} aria-label={`Print report ${record.id}`}><Printer className="size-4" /></Button>{canManage ? <><Button type="button" size="icon" variant="outline" className="border-blue-300 text-blue-600" onClick={() => void openReport(record, true)} aria-label={`Edit report ${record.id}`}><Pencil className="size-4" /></Button><Button type="button" size="icon" variant="outline" className="border-rose-300 text-rose-600" onClick={() => setDeleteTarget(record)} aria-label={`Delete report ${record.id}`}><Trash2 className="size-4" /></Button></> : null}</div></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-500">No inventory check reports found.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex items-center justify-between border-t p-4 text-sm text-slate-500"><span>Showing {visible.length ? (Math.min(page, pages) - 1) * size + 1 : 0} to {Math.min(Math.min(page, pages) * size, filtered.length)} of {filtered.length}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Badge className="grid min-w-9 place-items-center">{Math.min(page, pages)}</Badge><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button></div></div>
    </section>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>New inventory check report</DialogTitle><DialogDescription>A snapshot of every active item in {locationName} will be saved for counting.</DialogDescription></DialogHeader><form onSubmit={createReport} className="space-y-4"><div className="space-y-2"><Label>Memo</Label><Input value={newMemo} onChange={(event) => setNewMemo(event.target.value)} maxLength={240} placeholder="Example: Monthly laptop stock count" /></div><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><strong>Creator:</strong> {currentUserName}<br /><strong>Inventory:</strong> {locationName}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={saving}>{saving ? "Creating…" : "Create report"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) { setDetail(null); setEditing(false); } }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between"><div><DialogTitle>Inventory Check Report #{detail?.id}</DialogTitle><DialogDescription>{companyName} · {detail?.locationName} · {detail ? formatDate(detail.createdAt) : ""}</DialogDescription></div><Button variant="outline" onClick={() => window.print()} disabled={detailLoading}><Printer className="size-4" />Print</Button></div></DialogHeader>{detail ? <><div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_220px]"><div className="space-y-2"><Label>Memo</Label>{editing ? <Input value={detail.memo} onChange={(event) => setDetail({ ...detail, memo: event.target.value })} maxLength={240} /> : <p className="rounded-md border bg-white px-3 py-2 text-sm">{detail.memo || "No memo"}</p>}</div><div><Label>Creator</Label><p className="mt-2 text-sm font-semibold">{detail.creator || detail.creatorEmail || "Unknown"}</p></div></div><div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Item #</TableHead><TableHead>SKU</TableHead><TableHead>Item</TableHead><TableHead className="text-right">System Qty</TableHead><TableHead className="text-right">Physical Count</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader><TableBody>{detailLoading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-500">Loading report items…</TableCell></TableRow> : lines.length ? lines.map((line, index) => { const difference = line.countedQuantity === null ? null : Number(line.countedQuantity) - Number(line.systemQuantity); return <TableRow key={line.id}><TableCell>{line.itemNumber || "—"}</TableCell><TableCell className="font-mono text-xs">{line.sku}</TableCell><TableCell className="font-medium">{line.itemName}</TableCell><TableCell className="text-right">{quantity(line.systemQuantity)}</TableCell><TableCell className="text-right">{editing ? <Input type="number" step="0.01" className="ml-auto w-28 text-right" value={line.countedQuantity ?? ""} onChange={(event) => { const value = event.target.value; setLines((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, countedQuantity: value === "" ? null : Number(value) } : entry)); }} /> : line.countedQuantity === null ? "—" : quantity(line.countedQuantity)}</TableCell><TableCell className={`text-right font-semibold ${difference === null || difference === 0 ? "text-slate-500" : difference > 0 ? "text-emerald-600" : "text-rose-600"}`}>{difference === null ? "—" : quantity(difference)}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-500">No active inventory items were included.</TableCell></TableRow>}</TableBody></Table></div>{editing ? <DialogFooter><Button variant="outline" onClick={() => setEditing(false)}>Cancel editing</Button><Button onClick={() => void saveReport()} disabled={saving}>{saving ? "Saving…" : "Save report"}</Button></DialogFooter> : canManage ? <DialogFooter><Button onClick={() => setEditing(true)}><Pencil className="size-4" />Edit report</Button></DialogFooter> : null}</> : null}</DialogContent></Dialog>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete report #{deleteTarget?.id}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the inventory check report and all recorded counts.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={() => void deleteReport()}>{saving ? "Deleting…" : "Delete report"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
