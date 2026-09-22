"use client";

import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Printer, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CheckStatus = "pending" | "ok" | "not-ok";
type ReportRecord = { id: number; companyId: number; locationId: number; memo: string; createdAt: string; updatedAt: string; creator: string | null; creatorEmail: string | null; locationName: string; itemCount: number; totalQuantity: number; checkedCount: number; expectedCheckCount: number; mismatchedCount: number; itemIdSummary: string; remarkSummary: string };
type CompanyColumn = { id: number; name: string };
type CompanyQuantity = { companyId: number; companyName: string; quantity: number; countedQuantity: number | null };
type StockOption = { itemId: number; itemNumber: string; sku: string; itemName: string; totalQuantity: number; companyQuantities: CompanyQuantity[] };
type ReportLine = { id: number; itemId: number | null; itemNumber: string; sku: string; itemName: string; systemQuantity: number; companyQuantities: CompanyQuantity[]; remark: string };

const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const quantity = (value: number) => Number(value).toLocaleString("en-AE", { maximumFractionDigits: 2 });
const keyOf = (sku: string) => sku.trim().toUpperCase();
const qtyFor = (values: CompanyQuantity[], companyId: number) => values.find((value) => value.companyId === companyId)?.quantity ?? 0;
const recordStatus = (record: ReportRecord): CheckStatus => record.mismatchedCount > 0 ? "not-ok" : record.expectedCheckCount > 0 && record.checkedCount === record.expectedCheckCount ? "ok" : "pending";
const lineStatus = (line: ReportLine): CheckStatus => {
  const relevant = line.companyQuantities.filter((entry) => entry.quantity > 0.000001 || entry.countedQuantity !== null);
  return relevant.some((entry) => entry.countedQuantity !== null && Math.abs(entry.countedQuantity - entry.quantity) > 0.000001) ? "not-ok" : relevant.length > 0 && relevant.every((entry) => entry.countedQuantity !== null) ? "ok" : "pending";
};
const statusLabel = (status: CheckStatus) => status === "not-ok" ? "Not OK" : status === "ok" ? "OK" : "Pending";

export function InventoryCheckReports({ companyId, companyName, locationId, locationName, canManage, currentUserName }: { companyId: number; companyName: string; locationId: number; locationName: string; canManage: boolean; currentUserName: string }) {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CheckStatus>("all");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [newMemo, setNewMemo] = useState("");
  const [stock, setStock] = useState<StockOption[]>([]);
  const [stockCompanies, setStockCompanies] = useState<CompanyColumn[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, Record<string, string>>>({});
  const [detail, setDetail] = useState<ReportRecord | null>(null);
  const [detailCompanies, setDetailCompanies] = useState<CompanyColumn[]>([]);
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [lineFilter, setLineFilter] = useState<"all" | CheckStatus>("all");
  const skuLock = useSkuLock(editing && detail ? { resource: "inventory-check-reports", id: detail.id } : null);
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

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const response = await fetch(`/api/inventory-check-reports?companyId=${companyId}&locationId=${locationId}&options=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load in-stock items");
      setStock(data.items as StockOption[]);
      setStockCompanies(data.companies as CompanyColumn[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load in-stock items"); }
    finally { setStockLoading(false); }
  }, [companyId, locationId]);

  // Refresh whenever the selected company inventory changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadReports(); }, [loadReports]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => (statusFilter === "all" || recordStatus(record) === statusFilter) && (!term || [record.id, record.itemIdSummary, record.memo, record.remarkSummary, record.creator, record.creatorEmail, record.locationName].some((value) => String(value ?? "").toLowerCase().includes(term))));
  }, [records, search, statusFilter]);
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const visible = filtered.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);
  const matchingStock = useMemo(() => {
    const term = stockSearch.trim().toLowerCase();
    const rows = term ? stock.filter((item) => [item.itemNumber, item.sku, item.itemName].some((value) => value.toLowerCase().includes(term))) : stock;
    return rows.slice(0, 150);
  }, [stock, stockSearch]);
  const addableStock = useMemo(() => {
    const selected = new Set(lines.map((line) => keyOf(line.sku)));
    const term = addSearch.trim().toLowerCase();
    return stock.filter((item) => !selected.has(keyOf(item.sku)) && (!term || [item.itemNumber, item.sku, item.itemName].some((value) => value.toLowerCase().includes(term)))).slice(0, 25);
  }, [stock, lines, addSearch]);
  const visibleLines = useMemo(() => lineFilter === "all" ? lines : lines.filter((line) => lineStatus(line) === lineFilter), [lineFilter, lines]);

  async function beginCreate() {
    setSelectedSkus([]); setRemarks({}); setCounts({}); setNewMemo(""); setStockSearch(""); setCreateOpen(true);
    await loadStock();
  }

  function toggleSelected(sku: string, checked: boolean) {
    const key = keyOf(sku);
    setSelectedSkus((current) => checked ? [...new Set([...current, key])] : current.filter((value) => value !== key));
  }

  function setCreateCount(sku: string, companyId: number, value: string) {
    const key = keyOf(sku);
    setCounts((current) => ({ ...current, [key]: { ...(current[key] || {}), [String(companyId)]: value } }));
  }

  async function createReport(event: FormEvent) {
    event.preventDefault();
    if (!selectedSkus.length) return toast.error("Select at least one in-stock item.");
    setSaving(true);
    try {
      const response = await fetch("/api/inventory-check-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, locationId, memo: newMemo, lines: selectedSkus.map((sku) => ({ sku, remark: remarks[sku] || "", counts: counts[sku] || {} })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create inventory check report");
      setCreateOpen(false); await loadReports(); toast.success(`Inventory check report #${data.record.id} created`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create inventory check report"); }
    finally { setSaving(false); }
  }

  async function openReport(record: ReportRecord, edit = false) {
    setDetail(record); setEditing(edit && canManage); setDetailLoading(true); setLines([]); setDetailCompanies([]); setAddSearch(""); setLineFilter("all");
    try {
      const requests: Promise<Response>[] = [fetch(`/api/inventory-check-reports?companyId=${companyId}&reportId=${record.id}`, { cache: "no-store" })];
      if (edit && canManage) requests.push(fetch(`/api/inventory-check-reports?companyId=${companyId}&locationId=${locationId}&options=1`, { cache: "no-store" }));
      const responses = await Promise.all(requests);
      const data = await responses[0].json();
      if (!responses[0].ok) throw new Error(data.error || "Could not open inventory check report");
      setLines(data.lines as ReportLine[]); setDetailCompanies(data.companies as CompanyColumn[]);
      if (responses[1]) {
        const options = await responses[1].json();
        if (!responses[1].ok) throw new Error(options.error || "Could not load in-stock items");
        setStock(options.items as StockOption[]); setStockCompanies(options.companies as CompanyColumn[]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open inventory check report"); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  async function startEditing() { if (!canManage) return; await loadStock(); setEditing(true); }

  function addLine(option: StockOption) {
    setLines((current) => [...current, { id: -Date.now(), itemId: option.itemId, itemNumber: option.itemNumber, sku: option.sku, itemName: option.itemName, systemQuantity: option.totalQuantity, companyQuantities: option.companyQuantities, remark: "" }]);
  }

  function setLineCount(sku: string, companyId: number, value: string) {
    setLines((current) => current.map((line) => keyOf(line.sku) !== keyOf(sku) ? line : { ...line, companyQuantities: line.companyQuantities.map((entry) => entry.companyId === companyId ? { ...entry, countedQuantity: value === "" ? null : Number(value) } : entry) }));
  }

  async function saveReport() {
    if (!skuLock.ready || !detail || !canManage) return;
    if (!lines.length) return toast.error("Keep at least one item on the report.");
    setSaving(true);
    try {
      const response = await fetch("/api/inventory-check-reports", { method: "PATCH", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify({ companyId, id: detail.id, memo: detail.memo, lines: lines.map((line) => ({ id: line.id > 0 ? line.id : undefined, sku: line.sku, remark: line.remark, counts: Object.fromEntries(line.companyQuantities.map((entry) => [String(entry.companyId), entry.countedQuantity ?? ""])) })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save inventory check report");
      setEditing(false); await loadReports(); await openReport({ ...detail, memo: detail.memo }); toast.success(`Report #${detail.id} saved`);
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

  const reportColumns = useMemo(() => {
    const columns = new Map<number, CompanyColumn>();
    for (const company of detailCompanies) columns.set(company.id, company);
    if (editing || !detailCompanies.length) for (const company of stockCompanies) columns.set(company.id, company);
    return [...columns.values()];
  }, [detailCompanies, editing, stockCompanies]);

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white"><ClipboardList className="size-5" /></div><div><h2 className="font-bold text-slate-900">Inventory Check Reports</h2><p className="text-sm text-slate-500">{companyName} · {locationName} · Compare in-stock quantities across accessible companies</p></div></div><div className="flex items-center gap-2"><Badge variant="outline" className="bg-white"><Users className="mr-1 size-3.5" />{records.length} reports</Badge><Button onClick={() => void beginCreate()}><Plus className="size-4" />New report</Button></div></div>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><span>Show</span><Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select><span>entries</span><Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as "all" | CheckStatus); setPage(1); }}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="ok">OK</SelectItem><SelectItem value="not-ok">Not OK</SelectItem></SelectContent></Select></div><div className="relative w-full md:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search ID, memo, remark, report or creator" className="pl-9" /></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Report Date</TableHead><TableHead>Report #</TableHead><TableHead>Item ID No</TableHead><TableHead className="min-w-48">Memo</TableHead><TableHead>Qty</TableHead><TableHead className="min-w-48">Remark</TableHead><TableHead>Status</TableHead><TableHead>Creator</TableHead><TableHead>Inventory</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={10} className="py-12 text-center text-slate-500">Loading inventory check reports…</TableCell></TableRow> : visible.length ? visible.map((record) => { const status = recordStatus(record); return <TableRow key={record.id} className={status === "not-ok" ? "bg-rose-50/70 dark:bg-rose-950/20" : ""}><TableCell><span className="font-semibold text-rose-600">{formatDate(record.createdAt).split(",")[0]}</span><span className="block text-xs text-slate-500">{formatDate(record.createdAt).split(",").slice(1).join(",").trim()}</span></TableCell><TableCell className="font-mono font-semibold">{record.id}</TableCell><TableCell className="font-mono font-semibold">{record.itemIdSummary || "—"}</TableCell><TableCell>{record.memo || <span className="text-slate-400">No memo</span>}</TableCell><TableCell><span className="font-semibold">{quantity(record.totalQuantity)}</span><span className="block text-xs text-slate-500">{record.itemCount} item{record.itemCount === 1 ? "" : "s"}</span></TableCell><TableCell>{record.remarkSummary || <span className="text-slate-400">No remark</span>}</TableCell><TableCell><Badge variant="outline" className={status === "not-ok" ? "border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : status === "ok" ? "border-emerald-400 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}>{statusLabel(status)}</Badge></TableCell><TableCell className="font-semibold">{record.creator || record.creatorEmail || "Unknown"}</TableCell><TableCell>{record.locationName}</TableCell><TableCell><div className="flex justify-end gap-2"><Button type="button" size="icon" variant="outline" className="border-amber-300 text-amber-600" onClick={() => void openReport(record)} aria-label={`Print report ${record.id}`}><Printer className="size-4" /></Button>{canManage ? <><Button type="button" size="icon" variant="outline" className="border-blue-300 text-blue-600" onClick={() => void openReport(record, true)} aria-label={`Edit report ${record.id}`}><Pencil className="size-4" /></Button><Button type="button" size="icon" variant="outline" className="border-rose-300 text-rose-600" onClick={() => setDeleteTarget(record)} aria-label={`Delete report ${record.id}`}><Trash2 className="size-4" /></Button></> : null}</div></TableCell></TableRow>; }) : <TableRow><TableCell colSpan={10} className="py-12 text-center text-slate-500">No inventory check reports match this filter.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex items-center justify-between border-t p-4 text-sm text-slate-500"><span>Showing {visible.length ? (Math.min(page, pages) - 1) * size + 1 : 0} to {Math.min(Math.min(page, pages) * size, filtered.length)} of {filtered.length}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Badge className="grid min-w-9 place-items-center">{Math.min(page, pages)}</Badge><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button></div></div>
    </section>

    <Dialog open={createOpen} onOpenChange={(open) => { if (!saving) setCreateOpen(open); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-7xl"><DialogHeader><DialogTitle>Create Inventory Check Report</DialogTitle><DialogDescription>Select in-stock items, enter the checked quantity for each company, and add a remark. Matching quantities show OK; differences are highlighted in red.</DialogDescription></DialogHeader><form onSubmit={createReport} className="space-y-4"><div className="grid gap-4 sm:grid-cols-[1fr_240px]"><div className="space-y-2"><Label>Memo</Label><Input value={newMemo} onChange={(event) => setNewMemo(event.target.value)} maxLength={240} placeholder="Example: HP notebook stock check" /></div><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><strong>Date:</strong> {new Date().toLocaleDateString("en-GB")}<br /><strong>Creator:</strong> {currentUserName}<br /><strong>Selected:</strong> {selectedSkus.length}</div></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} className="pl-9" placeholder="Search by ID No, SKU, brand or model" /></div><div className="max-h-[48vh] overflow-auto rounded-xl border"><Table><TableHeader className="sticky top-0 z-10 bg-white"><TableRow><TableHead className="w-12">Select</TableHead><TableHead className="min-w-24">ID No</TableHead><TableHead className="min-w-32">SKU</TableHead><TableHead className="min-w-72">Description</TableHead>{stockCompanies.map((company) => <TableHead key={company.id} className="min-w-36 text-right">{company.name}<span className="block text-xs font-normal text-slate-500">System / Checked</span></TableHead>)}<TableHead className="min-w-52">Remark</TableHead></TableRow></TableHeader><TableBody>{stockLoading ? <TableRow><TableCell colSpan={5 + stockCompanies.length} className="py-12 text-center text-slate-500">Loading in-stock items…</TableCell></TableRow> : matchingStock.length ? matchingStock.map((item) => { const key = keyOf(item.sku); const selected = selectedSkus.includes(key); return <TableRow key={key} className={selected ? "bg-blue-50/60" : ""}><TableCell><Checkbox checked={selected} onCheckedChange={(checked) => toggleSelected(item.sku, checked === true)} aria-label={`Select ${item.itemName}`} /></TableCell><TableCell className="font-medium">#{item.itemNumber || "—"}</TableCell><TableCell className="font-mono text-xs text-slate-500">{item.sku}</TableCell><TableCell className="font-medium">{item.itemName}</TableCell>{stockCompanies.map((company) => { const systemQty = qtyFor(item.companyQuantities, company.id); const checked = counts[key]?.[String(company.id)] ?? ""; const mismatch = checked !== "" && Math.abs(Number(checked) - systemQty) > 0.000001; const matches = checked !== "" && !mismatch; return <TableCell key={company.id} className={mismatch ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : ""}><div className="flex items-center justify-end gap-2"><span className="min-w-10 text-right font-semibold">{quantity(systemQty)}</span><Input disabled={!selected} type="number" min="0" step="0.01" className={`w-20 text-right ${mismatch ? "border-rose-500" : matches ? "border-emerald-500" : ""}`} value={checked} onChange={(event) => setCreateCount(item.sku, company.id, event.target.value)} placeholder="Qty" />{matches ? <Badge variant="outline" className="border-emerald-400 bg-emerald-100 text-emerald-700">OK</Badge> : null}</div></TableCell>; })}<TableCell><Input disabled={!selected} value={remarks[key] || ""} onChange={(event) => setRemarks((current) => ({ ...current, [key]: event.target.value }))} maxLength={500} placeholder="Optional remark" /></TableCell></TableRow>; }) : <TableRow><TableCell colSpan={5 + stockCompanies.length} className="py-12 text-center text-slate-500">No in-stock items match your search.</TableCell></TableRow>}</TableBody></Table></div>{stock.length > 150 && !stockSearch ? <p className="text-xs text-slate-500">Showing the first 150 in-stock items. Search by SKU, ID No, brand, or model to find another item.</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Back</Button><Button disabled={saving || stockLoading || !selectedSkus.length}>{saving ? "Saving…" : `Save ${selectedSkus.length || ""} selected item${selectedSkus.length === 1 ? "" : "s"}`}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open && !saving) { setDetail(null); setEditing(false); } }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-7xl"><SkuLockNotice message={skuLock.message} /><DialogHeader><div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between"><div><DialogTitle>Inventory Check Report #{detail?.id}</DialogTitle><DialogDescription>{companyName} · {detail?.locationName} · {detail ? formatDate(detail.createdAt) : ""}</DialogDescription></div><Button variant="outline" onClick={() => window.print()} disabled={detailLoading}><Printer className="size-4" />Print</Button></div></DialogHeader>{detail ? <><div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_220px]"><div className="space-y-2"><Label>Memo</Label>{editing ? <Input disabled={!skuLock.ready} value={detail.memo} onChange={(event) => setDetail({ ...detail, memo: event.target.value })} maxLength={240} /> : <p className="rounded-md border bg-white px-3 py-2 text-sm">{detail.memo || "No memo"}</p>}</div><div><Label>Creator</Label><p className="mt-2 text-sm font-semibold">{detail.creator || detail.creatorEmail || "Unknown"}</p></div></div>{editing ? <div className="rounded-xl border border-dashed p-3"><Label>Add another in-stock item</Label><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} className="pl-9" placeholder="Search available items" /></div>{addSearch ? <div className="mt-2 max-h-44 overflow-auto rounded-lg border bg-white">{addableStock.length ? addableStock.map((item) => <button type="button" key={item.sku} onClick={() => { addLine(item); setAddSearch(""); }} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"><span><strong>{item.itemName}</strong><span className="block text-xs text-slate-500">ID #{item.itemNumber || "—"} · <span className="font-mono">{item.sku}</span></span></span><Plus className="size-4 text-blue-600" /></button>) : <p className="p-3 text-sm text-slate-500">No additional in-stock items found.</p>}</div> : null}</div> : null}<div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Matching checked quantities show OK; differences are shown in red.</p><Select value={lineFilter} onValueChange={(value) => setLineFilter(value as "all" | CheckStatus)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All items</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="ok">OK</SelectItem><SelectItem value="not-ok">Not OK</SelectItem></SelectContent></Select></div><div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead className="min-w-24">ID No</TableHead><TableHead className="min-w-32">SKU</TableHead><TableHead className="min-w-72">Description</TableHead>{reportColumns.map((company) => <TableHead key={company.id} className="min-w-40 text-right">{company.name}<span className="block text-xs font-normal text-slate-500">System / Checked</span></TableHead>)}<TableHead className="min-w-52">Remark</TableHead>{editing ? <TableHead className="w-14" /> : null}</TableRow></TableHeader><TableBody>{detailLoading ? <TableRow><TableCell colSpan={5 + reportColumns.length} className="py-12 text-center text-slate-500">Loading report items…</TableCell></TableRow> : visibleLines.length ? visibleLines.map((line) => { const status = lineStatus(line); return <TableRow key={`${line.id}-${line.sku}`} className={status === "not-ok" ? "bg-rose-50/70 dark:bg-rose-950/20" : ""}><TableCell className="font-medium">#{line.itemNumber || "—"}</TableCell><TableCell className="font-mono text-xs text-slate-500">{line.sku}</TableCell><TableCell className="font-medium">{line.itemName}<Badge variant="outline" className={`ml-2 ${status === "not-ok" ? "border-rose-400 text-rose-700" : status === "ok" ? "border-emerald-400 bg-emerald-100 text-emerald-700" : "border-amber-400 text-amber-700"}`}>{statusLabel(status)}</Badge></TableCell>{reportColumns.map((company) => { const entry = line.companyQuantities.find((value) => value.companyId === company.id); const systemQty = entry?.quantity ?? 0; const checkedQty = entry?.countedQuantity ?? null; const mismatch = checkedQty !== null && Math.abs(checkedQty - systemQty) > 0.000001; const matches = checkedQty !== null && !mismatch; return <TableCell key={company.id} className={mismatch ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : ""}>{editing ? <div className="flex items-center justify-end gap-2"><span className="min-w-10 text-right font-semibold">{quantity(systemQty)}</span><Input disabled={!skuLock.ready || !entry} type="number" min="0" step="0.01" className={`w-20 text-right ${mismatch ? "border-rose-500" : matches ? "border-emerald-500" : ""}`} value={checkedQty ?? ""} onChange={(event) => setLineCount(line.sku, company.id, event.target.value)} placeholder="Qty" />{matches ? <Badge variant="outline" className="border-emerald-400 bg-emerald-100 text-emerald-700">OK</Badge> : null}</div> : <div className="text-right"><span className="font-semibold">{quantity(systemQty)}</span><span className={`block text-xs ${mismatch ? "font-bold text-rose-600" : checkedQty !== null ? "font-semibold text-emerald-600" : "text-amber-600"}`}>{checkedQty === null ? "Pending" : mismatch ? `Checked: ${quantity(checkedQty)}` : `Checked: ${quantity(checkedQty)} · OK`}</span></div>}</TableCell>; })}<TableCell>{editing ? <Input disabled={!skuLock.ready} value={line.remark} onChange={(event) => setLines((current) => current.map((entry) => keyOf(entry.sku) === keyOf(line.sku) ? { ...entry, remark: event.target.value } : entry))} maxLength={500} /> : line.remark || <span className="text-slate-400">—</span>}</TableCell>{editing ? <TableCell><Button type="button" size="icon" variant="ghost" className="text-rose-600" onClick={() => setLines((current) => current.filter((entry) => keyOf(entry.sku) !== keyOf(line.sku)))} aria-label={`Remove ${line.itemName}`}><X className="size-4" /></Button></TableCell> : null}</TableRow>; }) : <TableRow><TableCell colSpan={5 + reportColumns.length} className="py-12 text-center text-slate-500">No items match this filter.</TableCell></TableRow>}</TableBody></Table></div>{editing ? <DialogFooter><Button variant="outline" onClick={() => void openReport(detail)}>Cancel editing</Button><Button onClick={() => void saveReport()} disabled={saving || !skuLock.ready || !lines.length}>{saving ? "Saving…" : "Save report"}</Button></DialogFooter> : canManage ? <DialogFooter><Button onClick={() => void startEditing()}><Pencil className="size-4" />Edit report</Button></DialogFooter> : null}</> : null}</DialogContent></Dialog>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete report #{deleteTarget?.id}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the inventory check report and its saved company quantity snapshot.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={() => void deleteReport()}>{saving ? "Deleting…" : "Delete report"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
