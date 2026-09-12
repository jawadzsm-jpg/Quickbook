"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageSearch, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LogisticsRecord = {
  id: number;
  itemNumber: string | null;
  sku: string;
  name: string;
  description: string;
  status: string;
  hsCode: string;
  countryOfOrigin: string;
  dimensionText: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
};

const hsCodes = [
  ["84713000", "Laptop / Notebook"],
  ["84714100", "Desktop Computer"],
  ["84717000", "HDD & RAM / Storage"],
  ["85235100", "SSD / Solid-State Storage"],
  ["85285200", "Computer Monitor"],
  ["84433100", "Printer / Multifunction"],
  ["84716000", "Keyboard & Mouse"],
  ["85183000", "Headphones / Speakers"],
  ["85044090", "Power Adapter / Charger"],
] as const;

const countries = ["CHINA", "TAIWAN", "THAILAND", "JAPAN", "SOUTH KOREA", "VIETNAM", "MALAYSIA", "INDIA", "UNITED STATES", "UNITED ARAB EMIRATES"];

export function ItemLogisticsCenter({ companyId, companyName, locationId, locationName, canEdit }: { companyId: number; companyName: string; locationId: number; locationName: string; canEdit: boolean }) {
  const [records, setRecords] = useState<LogisticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);
  const [activeIds, setActiveIds] = useState<Set<number>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/item-logistics?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load item logistics");
      setRecords(data.records as LogisticsRecord[]);
      setDirtyIds(new Set());
      setActiveIds(new Set());
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load item logistics"); }
    finally { setLoading(false); }
  }, [companyId, locationId]);

  // Refresh the editor when the selected company inventory changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? records.filter((record) => [record.itemNumber, record.sku, record.name, record.description, record.hsCode, record.countryOfOrigin].some((value) => String(value || "").toLowerCase().includes(term))) : records;
  }, [records, search]);
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * size, safePage * size);

  function update(id: number, field: keyof LogisticsRecord, value: string | number) {
    if (!canEdit) return;
    setRecords((current) => current.map((record) => record.id === id ? { ...record, [field]: value } : record));
    setDirtyIds((current) => new Set(current).add(id));
  }

  const skuLock = useSkuLock(activeIds.size || dirtyIds.size ? { resource: "item-logistics", records: [...new Set([...activeIds, ...dirtyIds])].sort((a, b) => a - b).map((id) => ({ id })) } : null);
  async function save() {
    if (!skuLock.ready) return;
    const changed = records.filter((record) => dirtyIds.has(record.id));
    if (!changed.length || !canEdit) return;
    setSaving(true);
    try {
      const response = await fetch("/api/item-logistics", { method: "PATCH", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify({ companyId, locationId, records: changed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save item logistics");
      setDirtyIds(new Set());
      setActiveIds(new Set());
      toast.success(`${data.updated} item${data.updated === 1 ? "" : "s"} updated`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save item logistics"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5"><SkuLockNotice message={skuLock.message} />
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white"><PackageSearch className="size-5" /></div><div><h2 className="font-bold text-slate-900">HS Code, COO &amp; Dimensions</h2><p className="text-sm text-slate-500">{companyName} · {locationName}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="bg-white">{records.length} items</Badge>{dirtyIds.size ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{dirtyIds.size} unsaved</Badge> : null}<Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving}><RotateCcw className="size-4" />Reset</Button>{canEdit ? <Button type="button" onClick={() => void save()} disabled={!skuLock.ready || !dirtyIds.size || saving}><Save className="size-4" />{saving ? "Saving…" : "Save Changes"}</Button> : null}</div></div>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-2 text-sm text-slate-600"><span>Show</span><Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent>{[25, 50, 100].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select><span>entries</span></div><div className="relative w-full md:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search items, SKU, HS code or COO" className="pl-9" /></div></div>
      <datalist id="hs-code-options">{hsCodes.map(([code, label]) => <option key={code} value={`${label} (${code})`} />)}</datalist>
      <datalist id="country-origin-options">{countries.map((country) => <option key={country} value={country} />)}</datalist>
      <div className="max-h-[68vh] overflow-auto"><Table className="min-w-[1500px]"><TableHeader className="sticky top-0 z-10 bg-white"><TableRow><TableHead className="min-w-96">Specs</TableHead><TableHead className="min-w-60">HS Code</TableHead><TableHead className="min-w-40">COO</TableHead><TableHead className="min-w-48">Dimension</TableHead><TableHead>Length (cm)</TableHead><TableHead>Width (cm)</TableHead><TableHead>Height (cm)</TableHead><TableHead>Weight (kg)</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-500">Loading item specifications…</TableCell></TableRow> : visible.length ? visible.map((record) => <TableRow key={record.id} onFocusCapture={() => { if (canEdit) setActiveIds((old) => old.has(record.id) ? old : new Set(old).add(record.id)); }} className={dirtyIds.has(record.id) ? "bg-amber-50/60" : ""}><TableCell><p className="font-bold text-blue-700">{record.name} <span className="text-xs font-medium uppercase text-rose-500">{record.status}</span></p><p className="mt-1 max-w-xl text-xs font-semibold text-slate-700">{record.description || record.sku} <span className="font-mono text-rose-500">#{record.itemNumber || record.sku}</span></p></TableCell><TableCell><Input list="hs-code-options" value={record.hsCode} disabled={!canEdit || skuLock.blocked} onChange={(event) => update(record.id, "hsCode", event.target.value)} placeholder="Select or enter HS code" /></TableCell><TableCell><Input list="country-origin-options" value={record.countryOfOrigin} disabled={!canEdit || skuLock.blocked} onChange={(event) => update(record.id, "countryOfOrigin", event.target.value.toUpperCase())} placeholder="Country" /></TableCell><TableCell><Input value={record.dimensionText} disabled={!canEdit || skuLock.blocked} onChange={(event) => update(record.id, "dimensionText", event.target.value)} placeholder="e.g. 11 × 35 × 55 cm" /></TableCell>{(["lengthCm", "widthCm", "heightCm", "weightKg"] as const).map((field) => <TableCell key={field}><Input type="number" min="0" step="0.01" value={record[field]} disabled={!canEdit || skuLock.blocked} onChange={(event) => update(record.id, field, Number(event.target.value))} className="min-w-28" /></TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-500">No matching inventory items found.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex items-center justify-between border-t p-4 text-sm text-slate-500"><span>Showing {visible.length ? (safePage - 1) * size + 1 : 0} to {Math.min(safePage * size, filtered.length)} of {filtered.length}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Badge className="grid min-w-9 place-items-center">{safePage}</Badge><Button size="sm" variant="outline" disabled={safePage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button></div></div>
    </section>
  </div>;
}
