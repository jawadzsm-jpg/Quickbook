"use client";
import { useCompanyDocumentOutput } from "./company-document-output";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Eye, GripHorizontal, ListPlus, PackageOpen, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { reportCsv, reportFilename, reportWorkbook } from "@/lib/report-export";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PrintOrientationSelect, type PrintOrientation } from "@/components/print-orientation-select";
import { customizationFieldLabels, customizationOptionFields, isOnboardValue, isOthersValue, type CustomizationOptionField, type CustomizationOptions } from "@/lib/customization-options";
import { useConfirmDelete } from "./confirm-delete-dialog";

type CustomizationRecord = {
  id: number; itemNumber: string | null; sku: string; name: string; category: string; description: string; specifications: string;
  quantity: number; status: string; customizationRam: string; customizationStorage: string; customizationScreen: string; partNumber: string;
  itemSerialNumber: string; upcNumber: string; customizationDetails: string;
};

type EditableField = "customizationRam" | "customizationStorage" | "customizationScreen" | "partNumber" | "itemSerialNumber" | "upcNumber" | "customizationDetails";

const upgradeBoxes = [["customizationRam", "ram"], ["customizationStorage", "storage"], ["customizationScreen", "screen"]] as const;
const emptyOptions: CustomizationOptions = { ram: [], storage: [], screen: [] };
const sameText = (a: string, b: string) => a.trim().toLocaleUpperCase("en") === b.trim().toLocaleUpperCase("en");
const TYPE_VALUE = "__type__";
const MANAGE_OPTIONS = "__manage__";

function productSpecs(record: CustomizationRecord) {
  try {
    const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
    return parsed.filter((entry) => entry?.value && entry.value.trim().toLowerCase() !== "no").map((entry) => `${entry.label}: ${entry.value}`).join(" · ");
  } catch { return record.description; }
}

function download(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function ItemCustomizationCenter({ companyId, companyName, locationId, locationName, currency, canOpenInventory, onOpenInventory }: {
  companyId: number; companyName: string; locationId: number; locationName: string; currency: string; canOpenInventory: boolean; onOpenInventory: (sku: string) => void;
}) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const documentOutput=useCompanyDocumentOutput();
  const [records, setRecords] = useState<CustomizationRecord[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [popupOffset, setPopupOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const [options, setOptions] = useState<CustomizationOptions>(emptyOptions);
  const [canManageOptions, setCanManageOptions] = useState(false);
  const [optionsField, setOptionsField] = useState<CustomizationOptionField | null>(null);
  const [newOption, setNewOption] = useState("");
  const [editingOption, setEditingOption] = useState<{ id: number; value: string } | null>(null);
  const [optionBusy, setOptionBusy] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/customization-options", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load upgrade options.");
      setOptions({ ...emptyOptions, ...data.options }); setCanManageOptions(data.canManage === true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load upgrade options."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOptions(); }, [loadOptions]);

  async function changeOption(method: "POST" | "PATCH" | "DELETE", field: CustomizationOptionField, body: { id?: number; value?: string }) {
    setOptionBusy(true);
    try {
      const response = await fetch("/api/customization-options", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, ...body }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save the upgrade option.");
      await loadOptions();
      if (method === "POST") setNewOption("");
      setEditingOption(null);
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the upgrade option."); return false; }
    finally { setOptionBusy(false); }
  }

  const load = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/item-customization?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load customization details.");
      setRecords(data.records ?? []); setCanEdit(data.canEdit === true); setDirtyIds(new Set()); setSelected(new Set());
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load customization details."); }
    finally { setLoading(false); }
  }, [companyId, locationId]);

  // Keep the page synchronized with the selected company inventory.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? records.filter((record) => [record.name, record.sku, record.itemNumber, record.category, record.description, record.customizationRam, record.customizationStorage, record.customizationScreen, record.partNumber, record.itemSerialNumber, record.upcNumber, record.customizationDetails].some((value) => String(value || "").toLowerCase().includes(term))) : records;
  }, [records, search]);
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * size, safePage * size);
  const detail = records.find((record) => record.id === detailId) ?? null;
  const completed = records.filter((record) => record.customizationRam || record.customizationStorage || record.partNumber).length;
  const serialised = records.filter((record) => record.itemSerialNumber).length;
  const upcAssigned = records.filter((record) => record.upcNumber).length;
  const needsDetails = records.filter((record) => !record.customizationDetails).length;

  function update(id: number, field: EditableField, value: string) {
    if (!canEdit) return;
    const next = field === "customizationDetails" ? value : value.toLocaleUpperCase("en");
    setRecords((current) => current.map((record) => record.id === id ? { ...record, [field]: next } : record));
    setDirtyIds((current) => new Set(current).add(id));
  }

  const skuLock = useSkuLock(dirtyIds.size ? { resource: "item-customization", records: [...dirtyIds].sort((a, b) => a - b).map((id) => ({ id })) } : null);

  async function save() {
    if (!canEdit || !dirtyIds.size || !skuLock.ready) return;
    setSaving(true);
    try {
      const response = await fetch("/api/item-customization", { method: "PATCH", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify({ companyId, locationId, records: records.filter((record) => dirtyIds.has(record.id)) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save customization details.");
      setDirtyIds(new Set());
      toast.success(`${data.updated} product${data.updated === 1 ? "" : "s"} updated`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save customization details."); }
    finally { setSaving(false); }
  }

  const exportRows = useMemo(() => {
    const rows = selected.size ? filtered.filter((record) => selected.has(record.id)) : filtered;
    return rows.map((record) => ({ itemNumber: record.itemNumber || "—", sku: record.sku, item: record.name, ram: record.customizationRam, storage: record.customizationStorage, screen: record.customizationScreen, partNumber: record.partNumber, serial: record.itemSerialNumber, upc: record.upcNumber, details: record.customizationDetails, hasCustomization: record.customizationRam || record.customizationStorage || record.partNumber ? 1 : 0, hasSerial: record.itemSerialNumber ? 1 : 0, hasUpc: record.upcNumber ? 1 : 0, needsDetails: record.customizationDetails ? 0 : 1 }));
  }, [filtered, selected]);
  const exportReport = useMemo(() => ({ key: "customization-details", title: "Product Customization Details", generatedAt: new Date().toISOString(), currency, columns: [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "item", label: "Product" }, { key: "ram", label: "RAM" }, { key: "storage", label: "Storage" }, { key: "screen", label: "Screen Details" }, { key: "partNumber", label: "Part Number" }, { key: "serial", label: "Serial" }, { key: "upc", label: "UPC No." }, { key: "details", label: "User Details" }], rows: exportRows }), [currency, exportRows]);

  async function exportFile(kind: "csv" | "xlsx" | "pdf") {
    if (!exportRows.length) return;
    setExporting(kind);
    try {
      if (kind === "csv") download(reportCsv(exportReport, companyName, locationName), "text/csv;charset=utf-8", reportFilename(exportReport, kind));
      else if (kind === "xlsx") download(await reportWorkbook(exportReport, companyName, locationName, exportRows, "portrait") as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", reportFilename(exportReport, kind));
      else download(await documentOutput.reportPdf(exportReport, companyName, locationName, exportRows, undefined, orientation) as BlobPart, "application/pdf", reportFilename(exportReport, kind));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not export customization details."); }
    finally { setExporting(null); }
  }

  function openDetails(id: number) { setDetailId(id); setPopupOffset({ x: 0, y: 0 }); }

  // RAM, Storage and Screen Details: ONBOARD stays plain text (no upgrades); OTHERS, or a saved option, shows the
  // dropdown of upgrade options.
  function upgradeBox(record: CustomizationRecord, field: typeof upgradeBoxes[number][0], kind: CustomizationOptionField) {
    const value = record[field];
    const list = options[kind];
    const chosen = list.find((option) => sameText(option.value, value))?.value ?? "";
    const disabled = !canEdit || skuLock.blocked;
    if (isOthersValue(value) || chosen) {
      return <Select value={chosen || undefined} disabled={disabled} onValueChange={(next) => { if (next === MANAGE_OPTIONS) { setOptionsField(kind); return; } update(record.id, field, next === TYPE_VALUE ? "" : next); }}>
        <SelectTrigger className="w-full" aria-label={`${customizationFieldLabels[kind]} upgrade option for ${record.name}`}><SelectValue placeholder="Choose an option" /></SelectTrigger>
        <SelectContent>{list.map((option) => <SelectItem key={option.id} value={option.value}>{option.value}</SelectItem>)}{!list.length ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No {customizationFieldLabels[kind]} options yet.</div> : null}<SelectItem value={TYPE_VALUE}>Type a value instead</SelectItem>{canManageOptions ? <SelectItem value={MANAGE_OPTIONS}>Add, edit or delete options…</SelectItem> : null}</SelectContent>
      </Select>;
    }
    return <><Input value={value} disabled={disabled} maxLength={field === "customizationScreen" ? 240 : 120} onChange={(event) => update(record.id, field, event.target.value)} placeholder="ONBOARD or OTHERS" aria-label={`${field} for ${record.name}`} />{isOnboardValue(value) ? <span className="mt-1 block text-[11px] text-muted-foreground">Onboard · no upgrades</span> : null}</>;
  }

  return <div className="min-w-0 space-y-5">{confirmDeleteDialog}<SkuLockNotice message={skuLock.message} />
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-muted/30 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><PackageOpen className="size-5" /></div><div><h2 className="font-bold">Product Customization Details</h2><p className="text-sm text-muted-foreground">{companyName} · {locationName} · role-controlled product specifications</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{records.length} products</Badge>{dirtyIds.size ? <Badge variant="secondary">{dirtyIds.size} unsaved</Badge> : null}<Button type="button" variant="outline" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4" />Reset</Button><PrintOrientationSelect value={orientation} onValueChange={setOrientation} /><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={Boolean(exporting) || !exportRows.length}><Download className="size-4" />{exporting ? "Preparing…" : "Export"}<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void exportFile("pdf")}>A4 {orientation} PDF</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportFile("xlsx")}>Excel workbook</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportFile("csv")}>CSV file</DropdownMenuItem></DropdownMenuContent></DropdownMenu>{canManageOptions ? <Button type="button" variant="outline" onClick={() => setOptionsField("ram")}><ListPlus className="size-4" />Upgrade options</Button> : null}{canEdit ? <Button type="button" disabled={!dirtyIds.size || saving || !skuLock.ready} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save Changes"}</Button> : null}</div></div>

      <div className="mx-auto w-full max-w-6xl border-b p-4 text-center sm:p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Customization overview</p><h3 className="mt-1 text-lg font-bold">Summary</h3><div className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))] [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1">{[["Total products", records.length], ["Customized", completed], ["Serial assigned", serialised], ["UPC assigned", upcAssigned], ["Needs user details", needsDetails]].map(([label, value]) => <div key={label} className="rounded-lg border bg-background p-3"><span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><strong className="mt-1 block text-lg tabular-nums">{value}</strong></div>)}</div></div>

      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Show</span><Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent>{[25, 50, 100].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select><span>entries</span>{selected.size ? <Badge variant="secondary">{selected.size} selected for export</Badge> : null}</div><div className="relative w-full md:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search product, SKU, screen, part, serial or UPC" className="pl-9" /></div></div>
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">RAM, Storage and Screen Details: write <strong>ONBOARD</strong> when it cannot be upgraded (no dropdown), or <strong>OTHERS</strong> to choose from the upgrade options. Inventory Overview users pick these options for their copies.</p>

      <div className="max-h-[68vh] overflow-auto">{/* From tablet width the checkbox and product columns stay pinned while the specification fields scroll sideways. */}<Table className="min-w-[1588px] table-fixed"><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead className="z-20 w-12 bg-background md:sticky md:left-0"><Checkbox checked={visible.length > 0 && visible.every((record) => selected.has(record.id))} aria-label="Select visible products" onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); visible.forEach((record) => { if (checked === true) next.add(record.id); else next.delete(record.id); }); return next; })} /></TableHead><TableHead className="z-20 w-72 bg-background md:sticky md:left-12 md:shadow-[1px_0_0_var(--border)]">Product specifications</TableHead><TableHead className="w-44">RAM</TableHead><TableHead className="w-44">Storage</TableHead><TableHead className="w-56">Screen Details</TableHead><TableHead className="w-52">Part Number</TableHead><TableHead className="w-44">Serial</TableHead><TableHead className="w-44">UPC No.</TableHead><TableHead className="w-28 text-center">Details</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={9} className="h-40 text-center text-muted-foreground">Loading product customization details…</TableCell></TableRow> : visible.length ? visible.map((record) => <TableRow key={record.id} className={`align-top ${dirtyIds.has(record.id) ? "bg-amber-50/60 dark:bg-amber-950/15" : ""}`}><TableCell className="z-[1] bg-card md:sticky md:left-0"><Checkbox checked={selected.has(record.id)} aria-label={`Select ${record.name}`} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked === true) next.add(record.id); else next.delete(record.id); return next; })} /></TableCell><TableCell className="z-[1] whitespace-normal bg-card md:sticky md:left-12 md:shadow-[1px_0_0_var(--border)]"><button type="button" disabled={!canOpenInventory} onClick={() => onOpenInventory(record.sku)} className="text-left font-bold text-primary underline-offset-4 enabled:underline enabled:hover:opacity-75 disabled:cursor-default">{record.name}</button><Badge variant="outline" className="ml-2 text-[10px] uppercase">{record.status}</Badge><p className="mt-1 break-words text-xs font-medium leading-5 text-muted-foreground">{record.description || productSpecs(record)}</p><p className="mt-2 text-xs"><span className="font-mono">SKU {record.sku}</span> · <span className="text-rose-600 dark:text-rose-300">#{record.itemNumber || "—"}</span> · QOH {record.quantity}</p></TableCell>{upgradeBoxes.map(([field, kind]) => <TableCell key={field}>{upgradeBox(record, field, kind)}</TableCell>)}{(["partNumber", "itemSerialNumber", "upcNumber"] as const).map((field) => <TableCell key={field}><Input value={record[field]} disabled={!canEdit || skuLock.blocked} maxLength={field === "itemSerialNumber" ? 240 : field === "partNumber" ? 160 : 120} onChange={(event) => update(record.id, field, event.target.value)} aria-label={`${field} for ${record.name}`} /></TableCell>)}<TableCell className="text-center"><Button type="button" size="sm" variant="outline" onClick={() => openDetails(record.id)} aria-label={`View customization details for ${record.name}`}><Eye className="size-4" />View</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="h-40 text-center text-muted-foreground">No matching products found.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm text-muted-foreground"><span>Showing {visible.length ? (safePage - 1) * size + 1 : 0}–{Math.min(safePage * size, filtered.length)} of {filtered.length}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Badge className="grid min-w-9 place-items-center">{safePage}</Badge><Button size="sm" variant="outline" disabled={safePage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button></div></div>
    </section>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetailId(null); }}><DialogContent style={{ marginLeft: popupOffset.x, marginTop: popupOffset.y }} className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><div className="-mx-2 -mt-2 mb-2 flex cursor-move touch-none items-center justify-center rounded-md border bg-muted/50 py-1 text-muted-foreground" title="Drag to move" onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: popupOffset.x, y: popupOffset.y, pointerX: event.clientX, pointerY: event.clientY }; }} onPointerMove={(event) => { if (!drag.current) return; setPopupOffset({ x: drag.current.x + event.clientX - drag.current.pointerX, y: drag.current.y + event.clientY - drag.current.pointerY }); }} onPointerUp={() => { drag.current = null; }}><GripHorizontal className="size-5" /><span className="ml-2 text-xs font-medium">Drag to move product details</span></div><DialogTitle>{detail?.name || "Product details"}</DialogTitle><DialogDescription>{detail ? `SKU ${detail.sku} · Item #${detail.itemNumber || "—"} · ${detail.category}` : "Customization details"}</DialogDescription></DialogHeader>{detail ? <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["RAM", detail.customizationRam], ["Storage", detail.customizationStorage], ["Screen Details", detail.customizationScreen], ["Part Number", detail.partNumber], ["Serial", detail.itemSerialNumber], ["UPC No.", detail.upcNumber], ["Quantity on hand", String(detail.quantity)]].map(([label, value]) => <div key={label} className="rounded-lg border bg-muted/20 p-3"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-1 break-words font-semibold">{value || "Not entered"}</p></div>)}</div><div className="rounded-lg border p-4"><h4 className="font-semibold">Full product specifications</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{detail.description || productSpecs(detail) || "No specifications entered."}</p></div><label className="block space-y-2"><span className="text-sm font-semibold">Details for users</span><Textarea rows={6} value={detail.customizationDetails} disabled={!canEdit || skuLock.blocked} maxLength={2000} onChange={(event) => update(detail.id, "customizationDetails", event.target.value)} placeholder="Add upgrade notes, compatibility, included parts, handling instructions or other details users should see." /><span className="block text-right text-xs text-muted-foreground">{detail.customizationDetails.length}/2000</span></label><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPopupOffset({ x: 0, y: 0 })}>Reset position</Button>{canOpenInventory ? <Button type="button" variant="outline" onClick={() => { setDetailId(null); onOpenInventory(detail.sku); }}>Open Inventory Item</Button> : null}{canEdit ? <Button type="button" disabled={!dirtyIds.has(detail.id) || saving || !skuLock.ready} onClick={() => void save()}><Save className="size-4" />Save Details</Button> : null}</div></div> : null}</DialogContent></Dialog>

    <Dialog open={Boolean(optionsField)} onOpenChange={(open) => { if (!open) { setOptionsField(null); setEditingOption(null); setNewOption(""); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Upgrade options</DialogTitle><DialogDescription>Shared by all companies. Shown in OTHERS boxes and in Inventory Overview.</DialogDescription></DialogHeader>{optionsField ? <div className="space-y-4"><div className="flex flex-wrap gap-1.5">{customizationOptionFields.map((field) => <Button key={field} type="button" size="sm" variant={field === optionsField ? "default" : "outline"} onClick={() => { setOptionsField(field); setEditingOption(null); setNewOption(""); }}>{customizationFieldLabels[field]} <Badge variant="secondary" className="ml-1">{options[field].length}</Badge></Button>)}</div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (newOption.trim()) void changeOption("POST", optionsField, { value: newOption }); }}><Input value={newOption} maxLength={120} disabled={optionBusy} onChange={(event) => setNewOption(event.target.value.toLocaleUpperCase("en"))} placeholder={optionsField === "ram" ? "32GB RAM UPGRADE" : optionsField === "storage" ? "2TB SSD UPGRADE" : "QHD WITH 240MHZ"} aria-label={`New ${customizationFieldLabels[optionsField]} option`} /><Button type="submit" disabled={optionBusy || !newOption.trim()}><Plus className="size-4" />Add</Button></form>
      <ul className="divide-y rounded-lg border">{options[optionsField].length ? options[optionsField].map((option) => <li key={option.id} className="flex items-center gap-2 p-2">{editingOption?.id === option.id ? <form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); if (editingOption.value.trim()) void changeOption("PATCH", optionsField, editingOption); }}><Input autoFocus value={editingOption.value} maxLength={120} disabled={optionBusy} onChange={(event) => setEditingOption({ id: option.id, value: event.target.value.toLocaleUpperCase("en") })} aria-label={`Edit ${option.value}`} /><Button type="submit" size="sm" disabled={optionBusy || !editingOption.value.trim()}><Save className="size-4" />Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingOption(null)}>Cancel</Button></form> : <><span className="flex-1 break-words text-sm font-medium">{option.value}</span><Button type="button" size="icon" variant="ghost" disabled={optionBusy} onClick={() => setEditingOption({ id: option.id, value: option.value })} aria-label={`Edit ${option.value}`}><Pencil className="size-4" /></Button><Button type="button" size="icon" variant="ghost" disabled={optionBusy} onClick={() => void confirmDelete({ title: `Delete option ${option.value}?`, description: "The option is removed for all companies.", details: [{ label: "Type", value: `${customizationFieldLabels[optionsField]} upgrade option` }, { label: "Value", value: option.value }], affected: ["Products that already use it keep their text."], confirmLabel: "Delete option" }).then((confirmed) => { if (confirmed) void changeOption("DELETE", optionsField, { id: option.id }); })} aria-label={`Delete ${option.value}`}><Trash2 className="size-4 text-rose-600" /></Button></>}</li>) : <li className="p-3 text-center text-sm text-muted-foreground">No {customizationFieldLabels[optionsField]} options yet.</li>}</ul></div> : null}</DialogContent></Dialog>
  </div>;
}
