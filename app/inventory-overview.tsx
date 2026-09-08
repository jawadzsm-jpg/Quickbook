"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Download, FileSpreadsheet, Mail, MessageCircle, PackageCheck, PackageX, RefreshCw, Search, Send, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type StockFilter = "all" | "in" | "low" | "out" | `location:${number}`;
type ShareChannel = "whatsapp" | "telegram" | "email";

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

function plainMoney(value: number) {
  return value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function xml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function InventoryOverview() {
  const [records, setRecords] = useState<OverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showQuantity, setShowQuantity] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [includeVat, setIncludeVat] = useState(false);

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
    inStock: records.filter((record) => Number(record.quantity) > 0).length,
    healthy: records.filter((record) => Number(record.quantity) > Number(record.reorderPoint)).length,
    low: records.filter((record) => Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint)).length,
    out: records.filter((record) => Number(record.quantity) <= 0).length,
  }), [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === "in" && Number(record.quantity) <= 0) return false;
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

  const selectedRecords = useMemo(() => records.filter((record) => selectedIds.has(record.id)), [records, selectedIds]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((record) => selectedIds.has(record.id));
  const someVisibleSelected = filtered.some((record) => selectedIds.has(record.id));

  const toggleSelected = (id: number, checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });

  const toggleAllVisible = (checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    for (const record of filtered) {
      if (checked) next.add(record.id); else next.delete(record.id);
    }
    return next;
  });

  const shareText = (channel: ShareChannel) => {
    if (!selectedRecords.length) return "";
    const items = selectedRecords.map((record) => {
      const title = channel === "whatsapp"
        ? `🔺 _*${record.name} - ${record.sku}*_ 🔺`
        : channel === "telegram"
          ? `🔺 ***${record.name} - ${record.sku}*** 🔺`
          : `***${record.name} - ${record.sku}***`;
      const lines = [title, specificationText(record)];
      const details: string[] = [];
      if (showQuantity) {
        const quantity = plainMoney(Number(record.quantity));
        details.push(channel === "telegram" ? `📦 Qty: ${quantity}` : channel === "email" ? `Quantity: ${quantity}` : `Qty: ${quantity}`);
      }
      if (showPrice) {
        const price = Number(record.salesPrice) * (includeVat ? 1.05 : 1);
        const value = `${record.currency} ${plainMoney(price)}${includeVat ? " (VAT included)" : " (VAT excluded)"}`;
        details.push(channel === "telegram" ? `💰 ${value}` : channel === "email" ? `Price: ${value}` : value);
      }
      if (details.length) lines.push(details.join(" | "));
      return lines.filter(Boolean).join("\n");
    });
    return items.join(channel === "telegram" ? "\n──────────────\n" : "\n-------------------\n");
  };

  const copyForChannel = async (channel: ShareChannel) => {
    const text = shareText(channel);
    if (!text) return toast.error("Select at least one item to copy.");
    const channelName = channel === "whatsapp" ? "WhatsApp" : channel === "telegram" ? "Telegram" : "Email";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast.success(`${channelName} format copied for ${selectedRecords.length} selected ${selectedRecords.length === 1 ? "item" : "items"}`);
  };

  const exportExcel = (withVat: boolean) => {
    if (!selectedRecords.length) return toast.error("Select at least one item to export.");
    const headers = ["Company", "Inventory", "Category", "Item No.", "SKU", "Item", "Specifications"];
    if (showQuantity) headers.push("Quantity");
    if (showPrice) headers.push(withVat ? "Price including 5% VAT" : "Export price excluding VAT", "Currency");
    const headerRow = headers.map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(header)}</Data></Cell>`).join("");
    const bodyRows = selectedRecords.map((record) => {
      const values: Array<{ value: unknown; type?: "Number"; style?: string }> = [
        { value: record.companyName }, { value: record.locationName }, { value: record.category },
        { value: record.itemNumber ?? "" }, { value: record.sku }, { value: record.name }, { value: specificationText(record) },
      ];
      if (showQuantity) values.push({ value: Number(record.quantity), type: "Number", style: "Number" });
      if (showPrice) values.push({ value: Number(record.salesPrice) * (withVat ? 1.05 : 1), type: "Number", style: "Money" }, { value: record.currency });
      return `<Row>${values.map((entry) => `<Cell${entry.style ? ` ss:StyleID="${entry.style}"` : ""}><Data ss:Type="${entry.type ?? "String"}">${xml(entry.value)}</Data></Cell>`).join("")}</Row>`;
    }).join("");
    const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Top"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.##"/></Style><Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00"/></Style></Styles><Worksheet ss:Name="Stock List"><Table><Column ss:Width="120"/><Column ss:Width="110"/><Column ss:Width="90"/><Column ss:Width="75"/><Column ss:Width="90"/><Column ss:Width="190"/><Column ss:Width="420"/><Row>${headerRow}</Row>${bodyRows}</Table></Worksheet></Workbook>`;
    const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comnet-stock-${withVat ? "vat-included" : "export-no-vat"}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${selectedRecords.length} items exported for Excel`);
  };

  const summaryButton = (active: boolean) => active
    ? "border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800 hover:text-white"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50";
  const columnCount = 3 + Number(showQuantity) + Number(showPrice);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button variant="outline" onClick={() => setFilter("all")} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === "all")}`}>
          <Boxes className="size-5" /><span className="font-semibold">All inventory</span><Badge className="bg-sky-500 text-white hover:bg-sky-500">{totals.quantity.toLocaleString()}</Badge>
        </Button>
        {locations.map((location) => <Button key={location.id} variant="outline" onClick={() => setFilter(`location:${location.id}`)} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === `location:${location.id}`)}`}>
          <Warehouse className="size-5" /><span className="font-semibold">{location.company}</span><span className="text-xs opacity-70">{location.location}</span><Badge variant="secondary">{location.quantity.toLocaleString()}</Badge>
        </Button>)}
        <Button variant="outline" onClick={() => setFilter("in")} className={`h-12 shrink-0 gap-2 rounded-xl ${summaryButton(filter === "in")}`}><PackageCheck className="size-5" /><span className="font-semibold">In stock</span><Badge className="bg-emerald-500 text-white hover:bg-emerald-500">{totals.inStock}</Badge></Button>
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

      <div className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Badge className="bg-slate-950 text-white hover:bg-slate-950">{selectedRecords.length} selected</Badge>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><Checkbox checked={!showQuantity} onCheckedChange={(checked) => setShowQuantity(checked !== true)} />Hide quantity</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><Checkbox checked={!showPrice} onCheckedChange={(checked) => setShowPrice(checked !== true)} />Hide price</label>
          <div className="flex rounded-lg border bg-white p-1" aria-label="Shared price VAT format">
            <Button type="button" size="sm" variant={!includeVat ? "default" : "ghost"} disabled={!showPrice} onClick={() => setIncludeVat(false)} className={!includeVat ? "bg-slate-950 text-white hover:bg-slate-800" : ""}>No VAT</Button>
            <Button type="button" size="sm" variant={includeVat ? "default" : "ghost"} disabled={!showPrice} onClick={() => setIncludeVat(true)} className={includeVat ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : ""}>Including VAT</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!selectedRecords.length} onClick={() => copyForChannel("whatsapp")} title="Copy WhatsApp format" className="bg-[#25D366] text-white hover:bg-[#1fb558]"><MessageCircle />WhatsApp</Button>
          <Button size="sm" disabled={!selectedRecords.length} onClick={() => copyForChannel("telegram")} title="Copy Telegram format" className="bg-[#229ED9] text-white hover:bg-[#1987bb]"><Send />Telegram</Button>
          <Button size="sm" variant="outline" disabled={!selectedRecords.length} onClick={() => copyForChannel("email")} title="Copy email format"><Mail />Email</Button>
          <Button size="sm" variant="outline" disabled={!selectedRecords.length} onClick={() => exportExcel(false)}><Download />Excel no VAT</Button>
          <Button size="sm" variant="outline" disabled={!selectedRecords.length} onClick={() => exportExcel(true)}><FileSpreadsheet />Excel + VAT</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow className="bg-slate-50"><TableHead className="w-12"><Checkbox aria-label="Select all visible items" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /></TableHead><TableHead className="w-[55%] font-bold text-slate-900">Product specifications</TableHead><TableHead className="font-bold text-slate-900">Company / inventory</TableHead>{showQuantity && <TableHead className="w-24 text-right font-bold text-slate-900">Qty</TableHead>}{showPrice && <TableHead className="w-36 text-right font-bold text-slate-900">Price</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading all inventories…</TableCell></TableRow> : categories.length === 0 ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-slate-500">No products match this view.</TableCell></TableRow> : categories.flatMap(([category, items]) => [
              <TableRow key={`category-${category}`} className="border-slate-800 bg-slate-950 hover:bg-slate-950"><TableCell colSpan={columnCount} className="py-3 font-bold text-white"><span className="mr-2 text-emerald-400">●</span>{category}<Badge className="ml-3 bg-white/15 text-white hover:bg-white/15">{items.length} items</Badge></TableCell></TableRow>,
              ...items.map((record) => {
                const low = Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint);
                const out = Number(record.quantity) <= 0;
                const description = specificationText(record);
                return <TableRow key={record.id} data-state={selectedIds.has(record.id) ? "selected" : undefined} className="align-top data-[state=selected]:bg-sky-50 hover:bg-slate-50/80">
                  <TableCell className="py-5"><Checkbox aria-label={`Select ${record.name}`} checked={selectedIds.has(record.id)} onCheckedChange={(checked) => toggleSelected(record.id, checked === true)} /></TableCell>
                  <TableCell className="py-4"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-bold text-blue-700 underline decoration-blue-300 underline-offset-2">{record.name}</span>{out ? <Badge variant="destructive">Out of stock</Badge> : low ? <Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">Low stock</Badge> : <Badge variant="outline" className="border-emerald-200 text-emerald-700"><PackageCheck className="mr-1 size-3" />In stock</Badge>}</div>{description && <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-slate-700">{description}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className="font-semibold text-slate-600">SKU: {record.sku}</span>{record.itemNumber && <span className="font-bold text-rose-600">#{record.itemNumber}</span>}</div></TableCell>
                  <TableCell className="py-4"><p className="font-semibold text-slate-900">{record.companyName}</p><p className="mt-1 text-sm text-slate-500"><Warehouse className="mr-1 inline size-3.5" />{record.locationName} · {record.locationCode}</p></TableCell>
                  {showQuantity && <TableCell className={`py-4 text-right text-base font-black ${out ? "text-rose-600" : low ? "text-amber-600" : "text-slate-900"}`}>{Number(record.quantity).toLocaleString()}</TableCell>}
                  {showPrice && <TableCell className="py-4 text-right text-base font-black text-rose-600">{money(Number(record.salesPrice) * (includeVat ? 1.05 : 1), record.currency)}{includeVat && <span className="mt-1 block text-[11px] font-semibold text-emerald-600">VAT included</span>}</TableCell>}
                </TableRow>;
              }),
            ])}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Showing {filtered.length} of {records.length} products</span><span>{totals.healthy} healthy · {totals.low} low · {totals.out} out of stock</span></div>
    </section>
  </div>;
}
