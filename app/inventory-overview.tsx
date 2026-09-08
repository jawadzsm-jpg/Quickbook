"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackageCheck, PackageX, RefreshCw, Search, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type OverviewItem = {
  id: number;
  itemNumber: string | null;
  sku: string;
  name: string;
  category: string;
  description: string;
  specifications: string;
  quantity: number;
  reorderPoint: number;
  salesPrice: number;
  status: string;
  createdAt: string;
  companyId: number;
  companyName: string;
  currency: string;
  locationId: number;
  locationName: string;
  locationCode: string;
};

type StockFilter = "all" | "low" | "out" | `location:${number}`;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-AE", { maximumFractionDigits: 2 })}`;
  }
}

function specificationText(record: OverviewItem) {
  try {
    const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
    const values = parsed.filter((entry) => entry?.value).map((entry) => entry.value).join(" | ");
    if (values) return values;
  } catch {
    // Older records can still fall back to their saved description.
  }
  return record.description.trim();
}

export function InventoryOverview() {
  const [records, setRecords] = useState<OverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inventory-overview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load inventory overview");
      setRecords(data.records as OverviewItem[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load inventory overview");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load synchronizes the overview with all persisted inventories.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const locations = useMemo(() => {
    const grouped = new Map<number, { id: number; company: string; location: string; quantity: number; itemCount: number }>();
    for (const record of records) {
      const existing = grouped.get(record.locationId);
      if (existing) {
        existing.quantity += Number(record.quantity);
        existing.itemCount += 1;
      } else {
        grouped.set(record.locationId, { id: record.locationId, company: record.companyName, location: record.locationName, quantity: Number(record.quantity), itemCount: 1 });
      }
    }
    return [...grouped.values()].sort((a, b) => a.company.localeCompare(b.company) || a.location.localeCompare(b.location));
  }, [records]);

  const totals = useMemo(() => ({
    quantity: records.reduce((sum, record) => sum + Number(record.quantity), 0),
    inStock: records.filter((record) => Number(record.quantity) > Number(record.reorderPoint)).length,
    low: records.filter((record) => Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint)).length,
    out: records.filter((record) => Number(record.quantity) <= 0).length,
  }), [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === "low" && !(Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint))) return false;
      if (filter === "out" && Number(record.quantity) > 0) return false;
      if (filter.startsWith("location:") && record.locationId !== Number(filter.split(":")[1])) return false;
      if (!term) return true;
      return [record.name, record.sku, record.itemNumber, record.category, record.description, record.specifications, record.companyName, record.locationName]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [filter, records, search]);

  const categories = useMemo(() => {
    const grouped = new Map<string, OverviewItem[]>();
    for (const record of filtered) {
      const category = record.category.trim() || "General";
      grouped.set(category, [...(grouped.get(category) ?? []), record]);
    }
    return [...grouped.entries()];
  }, [filtered]);

  const summaryButton = (active: boolean) => active
    ? "border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800 hover:text-white"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50";

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button variant="outline" onClick={() => setFilter("all")} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === "all")}`}>
          <Boxes className="size-5" /><span className="font-semibold">All inventory</span><Badge className="bg-sky-500 text-white hover:bg-sky-500">{totals.quantity.toLocaleString()}</Badge>
        </Button>
        {locations.map((location) => <Button key={location.id} variant="outline" onClick={() => setFilter(`location:${location.id}`)} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === `location:${location.id}`)}`}>
          <Warehouse className="size-5" /><span className="font-semibold">{location.company}</span><span className="text-xs opacity-70">{location.location}</span><Badge variant="secondary">{location.quantity.toLocaleString()}</Badge>
        </Button>)}
        <Button variant="outline" onClick={() => setFilter("low")} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === "low")}`}><AlertTriangle className="size-5" /><span className="font-semibold">Low stock</span><Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">{totals.low}</Badge></Button>
        <Button variant="outline" onClick={() => setFilter("out")} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === "out")}`}><PackageX className="size-5" /><span className="font-semibold">Out of stock</span><Badge variant="destructive">{totals.out}</Badge></Button>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold text-slate-950">Consolidated stock</h2><p className="text-sm text-slate-500">All companies, inventories, item details, quantities and selling prices.</p></div>
        <div className="flex gap-2">
          <div className="relative min-w-0 sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, item, specs or inventory…" className="pl-9" /></div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh inventory overview"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow className="bg-slate-50"><TableHead className="w-[58%] font-bold text-slate-900">Product specifications</TableHead><TableHead className="font-bold text-slate-900">Company / inventory</TableHead><TableHead className="w-24 text-right font-bold text-slate-900">Qty</TableHead><TableHead className="w-36 text-right font-bold text-slate-900">Price</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={4} className="h-40 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading all inventories…</TableCell></TableRow> : categories.length === 0 ? <TableRow><TableCell colSpan={4} className="h-40 text-center text-slate-500">No products match this view.</TableCell></TableRow> : categories.flatMap(([category, items]) => [
              <TableRow key={`category-${category}`} className="border-slate-800 bg-slate-950 hover:bg-slate-950"><TableCell colSpan={4} className="py-3 font-bold text-white"><span className="mr-2 text-emerald-400">●</span>{category}<Badge className="ml-3 bg-white/15 text-white hover:bg-white/15">{items.length} items</Badge></TableCell></TableRow>,
              ...items.map((record) => {
                const low = Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint);
                const out = Number(record.quantity) <= 0;
                const description = specificationText(record);
                return <TableRow key={record.id} className="align-top hover:bg-slate-50/80">
                  <TableCell className="py-4"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-bold text-blue-700 underline decoration-blue-300 underline-offset-2">{record.name}</span>{out ? <Badge variant="destructive">Out of stock</Badge> : low ? <Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">Low stock</Badge> : <Badge variant="outline" className="border-emerald-200 text-emerald-700"><PackageCheck className="mr-1 size-3" />In stock</Badge>}</div>{description && <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-slate-700">{description}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className="font-semibold text-slate-600">SKU: {record.sku}</span>{record.itemNumber && <span className="font-bold text-rose-600">#{record.itemNumber}</span>}</div></TableCell>
                  <TableCell className="py-4"><p className="font-semibold text-slate-900">{record.companyName}</p><p className="mt-1 text-sm text-slate-500"><Warehouse className="mr-1 inline size-3.5" />{record.locationName} · {record.locationCode}</p></TableCell>
                  <TableCell className={`py-4 text-right text-base font-black ${out ? "text-rose-600" : low ? "text-amber-600" : "text-slate-900"}`}>{Number(record.quantity).toLocaleString()}</TableCell>
                  <TableCell className="py-4 text-right text-base font-black text-rose-600">{money(Number(record.salesPrice), record.currency)}</TableCell>
                </TableRow>;
              }),
            ])}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Showing {filtered.length} of {records.length} products</span><span>{totals.inStock} healthy · {totals.low} low · {totals.out} out of stock</span></div>
    </section>
  </div>;
}
