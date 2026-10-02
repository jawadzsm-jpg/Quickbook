"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, Boxes, Download, Eye, FileSpreadsheet, Mail, MessageCircle, PackageCheck, PackageOpen, PlaneLanding, RefreshCw, Rocket, Search, Send, ShoppingCart, UserRound, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { inventoryItemLine, inventorySocialShareText, itemSpecificationDescription } from "@/lib/item-description";

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
  customizationRam: string;
  customizationStorage: string;
  partNumber: string;
  itemSerialNumber: string;
  upcNumber: string;
  customizationDetails: string;
  latestReceivedAt: string | null;
  companyId: number;
  companyName: string;
  currency: string;
  locationId: number;
  locationName: string;
  locationCode: string;
};

type InventoryPresence = Pick<OverviewItem, "id" | "companyId" | "companyName" | "currency" | "locationId" | "locationName" | "locationCode" | "quantity" | "reorderPoint" | "salesPrice">;

type ConsolidatedItem = OverviewItem & {
  inventories: InventoryPresence[];
  recordIds: number[];
};

type StockFilter = "all" | "in" | "low" | `location:${number}`;
type ShareChannel = "whatsapp" | "telegram" | "email";
type ActivityView = "incoming" | "launched" | "priceChanges" | "sold";
type ActivityRecord = {
  id: number;
  itemId: number;
  transactionId: number | null;
  date: string;
  documentNumber: string;
  documentType?: string;
  documentStatus?: string;
  linkedBillId?: number | null;
  linkedBillNumber?: string | null;
  party: string;
  salesRep: string;
  sku: string;
  itemNumber: string | null;
  itemName: string;
  companyId: number;
  locationId: number;
  companyName: string;
  locationName: string;
  currency: string;
  quantity: number;
  price: number;
  previousPrice?: number;
  currentPrice?: number;
};
type InventoryActivity = Record<ActivityView, ActivityRecord[]>;
const emptyActivity: InventoryActivity = { incoming: [], launched: [], priceChanges: [], sold: [] };

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
    if (values) return itemSpecificationDescription(values, record.name, record.sku, record.itemNumber);
  } catch {
    // Older records can still fall back to their saved description.
  }
  return itemSpecificationDescription(record.description, record.name, record.sku, record.itemNumber);
}

function plainMoney(value: number) {
  return value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function xml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function activityDate(value: string) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function receivedAge(value: string | null) {
  if (!value) return "Receipt date unavailable";
  const received = new Date(value);
  if (Number.isNaN(received.getTime())) return "Receipt date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - received.getTime()) / 86_400_000));
  return days === 0 ? "Received today" : `Received ${days} ${days === 1 ? "day" : "days"} ago`;
}

function specificationValue(record: OverviewItem, labels: string[]) {
  try {
    const wanted = new Set(labels.map((label) => label.toLowerCase()));
    const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
    return parsed.find((entry) => wanted.has(String(entry.label ?? "").trim().toLowerCase()))?.value?.trim() ?? "";
  } catch { return ""; }
}

export function InventoryOverview({ onOpenDocument, onOpenItem }: { onOpenDocument?: (id: number) => void; onOpenItem?: (id: number) => void } = {}) {
  const [records, setRecords] = useState<OverviewItem[]>([]);
  const [activity, setActivity] = useState<InventoryActivity>(emptyActivity);
  const [activityView, setActivityView] = useState<ActivityView>("incoming");
  const [canSelectItems, setCanSelectItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showQuantity, setShowQuantity] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [includeVat, setIncludeVat] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ConsolidatedItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setCanSelectItems(false);
    setSelectedIds(new Set());
    try {
      const response = await fetch("/api/inventory-overview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load inventory overview");
      setRecords(data.records as OverviewItem[]);
      setActivity({ ...emptyActivity, ...(data.activity as Partial<InventoryActivity> | undefined) });
      setCanSelectItems(data.canSelectItems === true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load inventory overview");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load synchronizes the overview with all persisted inventories.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Expire bill receipts and price changes even while the overview stays open.
  useEffect(() => {
    const expiringEntries = [...activity.launched, ...activity.priceChanges];
    if (!expiringEntries.length) return;
    const expiresAt = Math.min(...expiringEntries.map((entry) => new Date(entry.date).getTime() + 12 * 60 * 60 * 1000));
    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      setActivity((current) => ({
        ...current,
        launched: current.launched.filter((entry) => new Date(entry.date).getTime() > cutoff),
        priceChanges: current.priceChanges.filter((entry) => new Date(entry.date).getTime() > cutoff),
      }));
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [activity.launched, activity.priceChanges]);

  const inStockRecords = useMemo(() => records.filter((record) => Number(record.quantity) > 0), [records]);

  const consolidatedRecords = useMemo(() => {
    const grouped = new Map<string, ConsolidatedItem>();
    for (const record of inStockRecords) {
      const identity = record.itemNumber?.trim() || record.sku.trim().toLowerCase();
      const key = `${record.companyId}:${identity}`;
      const inventory: InventoryPresence = {
        id: record.id,
        companyId: record.companyId,
        companyName: record.companyName,
        currency: record.currency,
        locationId: record.locationId,
        locationName: record.locationName,
        locationCode: record.locationCode,
        quantity: Number(record.quantity),
        reorderPoint: Number(record.reorderPoint),
        salesPrice: Number(record.salesPrice),
      };
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += Number(record.quantity);
        existing.reorderPoint += Number(record.reorderPoint);
        existing.inventories.push(inventory);
        existing.recordIds.push(record.id);
        if (new Date(record.latestReceivedAt ?? 0).getTime() > new Date(existing.latestReceivedAt ?? 0).getTime()) existing.latestReceivedAt = record.latestReceivedAt;
        for (const field of ["customizationRam", "customizationStorage", "partNumber", "itemSerialNumber", "upcNumber", "customizationDetails"] as const) {
          if (!existing[field] && record[field]) existing[field] = record[field];
        }
      } else {
        grouped.set(key, {
          ...record,
          quantity: Number(record.quantity),
          reorderPoint: Number(record.reorderPoint),
          inventories: [inventory],
          recordIds: [record.id],
        });
      }
    }
    return [...grouped.values()];
  }, [inStockRecords]);

  const locations = useMemo(() => {
    const grouped = new Map<number, { id: number; company: string; location: string; quantity: number; itemCount: number }>();
    for (const record of inStockRecords) {
      const existing = grouped.get(record.locationId);
      if (existing) {
        existing.quantity += Number(record.quantity);
        existing.itemCount += 1;
      } else {
        grouped.set(record.locationId, { id: record.locationId, company: record.companyName, location: record.locationName, quantity: Number(record.quantity), itemCount: 1 });
      }
    }
    return [...grouped.values()].sort((a, b) => a.company.localeCompare(b.company) || a.location.localeCompare(b.location));
  }, [inStockRecords]);

  const totals = useMemo(() => ({
    quantity: inStockRecords.reduce((sum, record) => sum + Number(record.quantity), 0),
    inStock: consolidatedRecords.length,
    healthy: consolidatedRecords.filter((record) => Number(record.quantity) > Number(record.reorderPoint)).length,
    low: consolidatedRecords.filter((record) => Number(record.quantity) <= Number(record.reorderPoint)).length,
  }), [consolidatedRecords, inStockRecords]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return consolidatedRecords.flatMap((record) => {
      if (filter === "low" && !(Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint))) return [];
      const locationId = filter.startsWith("location:") ? Number(filter.split(":")[1]) : null;
      const inventories = locationId === null ? record.inventories : record.inventories.filter((inventory) => inventory.locationId === locationId);
      if (!inventories.length) return [];
      if (term && ![record.name, record.sku, record.itemNumber, record.category, record.description, record.specifications, record.companyName, ...inventories.flatMap((inventory) => [inventory.locationName, inventory.locationCode])]
        .some((value) => String(value ?? "").toLowerCase().includes(term))) return [];
      return [{
        ...record,
        inventories,
        quantity: inventories.reduce((sum, inventory) => sum + Number(inventory.quantity), 0),
        reorderPoint: inventories.reduce((sum, inventory) => sum + Number(inventory.reorderPoint), 0),
      }];
    });
  }, [consolidatedRecords, filter, search]);

  const categories = useMemo(() => {
    const grouped = new Map<string, ConsolidatedItem[]>();
    for (const record of filtered) {
      const category = record.category.trim() || "General";
      grouped.set(category, [...(grouped.get(category) ?? []), record]);
    }
    return [...grouped.entries()];
  }, [filtered]);

  const selectedRecords = useMemo(() => canSelectItems ? consolidatedRecords.filter((record) => selectedIds.has(record.id)) : [], [canSelectItems, consolidatedRecords, selectedIds]);
  const visibleActivity = activity[activityView];

  const openActivityRecord = (entry: ActivityRecord, kind: "document" | "item") => {
    if (kind === "document" && entry.transactionId && onOpenDocument) return onOpenDocument(entry.transactionId);
    if (kind === "item" && onOpenItem) return onOpenItem(entry.itemId);
    window.dispatchEvent(new CustomEvent("inventory-activity-open", { detail: { kind, id: kind === "document" ? entry.transactionId : entry.itemId, companyId: entry.companyId, locationId: entry.locationId, sku: entry.sku } }));
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every((record) => selectedIds.has(record.id));
  const someVisibleSelected = filtered.some((record) => selectedIds.has(record.id));

  const toggleSelected = (id: number, checked: boolean) => setSelectedIds((current) => {
    if (!canSelectItems || loading) return current;
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });

  const toggleAllVisible = (checked: boolean) => setSelectedIds((current) => {
    if (!canSelectItems || loading) return current;
    const next = new Set(current);
    for (const record of filtered) {
      if (checked) next.add(record.id); else next.delete(record.id);
    }
    return next;
  });

  const shareText = (channel: ShareChannel) => {
    if (!selectedRecords.length) return "";
    const items = selectedRecords.map((record) => {
      const description = specificationText(record);
      const title = channel === "email"
        ? `***${inventoryItemLine(record.name, record.sku, description)}***`
        : inventorySocialShareText(record.name, record.sku, description, channel);
      const lines = [title];
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
    if (!canSelectItems || loading) return;
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
    if (!canSelectItems || loading) return;
    if (!selectedRecords.length) return toast.error("Select at least one item to export.");
    const headers = ["Company", "Inventory", "Category", "Item No.", "SKU", "Item", "Specifications"];
    if (showQuantity) headers.push("Quantity");
    if (showPrice) headers.push(withVat ? "Price including 5% VAT" : "Export price excluding VAT", "Currency");
    const headerRow = headers.map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(header)}</Data></Cell>`).join("");
    const bodyRows = selectedRecords.map((record) => {
      const values: Array<{ value: unknown; type?: "Number"; style?: string }> = [
        { value: record.companyName }, { value: record.inventories.map((inventory) => inventory.locationName).join(", ") }, { value: record.category },
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
  const columnCount = 2 + Number(showQuantity) + Number(showPrice);
  const activityTabs = [
    { id: "incoming" as const, label: "Incoming", Icon: PlaneLanding, count: activity.incoming.length, badge: "bg-amber-400 text-slate-950" },
    { id: "launched" as const, label: "New Arrival", Icon: Rocket, count: activity.launched.length, badge: "bg-rose-500 text-white" },
    { id: "priceChanges" as const, label: "Price Change", Icon: BadgeDollarSign, count: activity.priceChanges.length, badge: "bg-sky-500 text-white" },
    { id: "sold" as const, label: "Just Sold", Icon: ShoppingCart, count: activity.sold.length, badge: "bg-emerald-500 text-white" },
  ];
  const activityEmpty = activityView === "incoming" ? "No open purchase-order quantities." : activityView === "launched" ? "No bill receipts in the last 12 hours." : activityView === "priceChanges" ? "No selling-price changes in the last 12 hours." : "No recent invoice or sales-receipt lines.";

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="overflow-x-auto"><div className="grid min-w-[720px] grid-cols-4 border-b bg-muted/40">
        {activityTabs.map(({ id, label, Icon, count, badge }) => <button key={id} type="button" onClick={() => setActivityView(id)} className={`flex min-h-20 items-center justify-center gap-3 border-r px-4 text-base font-semibold transition-colors last:border-r-0 sm:text-lg ${activityView === id ? "bg-card text-foreground shadow-[inset_0_-3px_0_hsl(var(--primary))]" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`} aria-pressed={activityView === id}>
          <Icon className="size-6 shrink-0" /><span>{label}</span><Badge className={`${badge} min-w-7 justify-center hover:opacity-90`}>{count}</Badge>
        </button>)}
      </div></div>
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow><TableHead className="w-32">Date</TableHead><TableHead>Item</TableHead><TableHead>Company · inventory</TableHead><TableHead>Linked area</TableHead><TableHead>Activity</TableHead><TableHead className="w-24 text-right">Open</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading inventory activity…</TableCell></TableRow> : visibleActivity.length ? visibleActivity.map((entry) => {
              const linkedDocument = activityView === "incoming" || activityView === "launched" || activityView === "sold";
              return <TableRow key={`${activityView}-${entry.id}`} className="align-top">
                <TableCell className="whitespace-nowrap font-medium">{activityDate(entry.date)}</TableCell>
                <TableCell><p className="font-semibold text-primary">{entry.itemName}</p><p className="mt-1 text-xs text-muted-foreground">SKU {entry.sku}{entry.itemNumber ? ` · #${entry.itemNumber}` : ""}</p></TableCell>
                <TableCell><p className="font-medium">{entry.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{entry.locationName || "All inventories"}</p></TableCell>
                <TableCell>{linkedDocument ? <><p className="font-mono font-semibold">{activityView === "incoming" ? "Purchase Order " : ""}{entry.documentNumber}</p><p className="mt-1 text-xs text-muted-foreground">{entry.party || (activityView === "sold" ? "Customer" : "Supplier")}</p>{activityView === "incoming" ? <p className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${entry.linkedBillNumber ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{entry.linkedBillNumber ? `Partially converted to Bill ${entry.linkedBillNumber}` : "Ready to convert to Bill"}</p> : null}{activityView === "sold" ? <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><UserRound className="size-3" />Sales rep: {entry.salesRep || "Not assigned"}</p> : null}</> : <span className="text-sm font-medium">Selling price update</span>}</TableCell>
                <TableCell>{activityView === "priceChanges" ? <><p className="font-semibold"><span className="text-muted-foreground line-through">{money(Number(entry.previousPrice), entry.currency)}</span><span className="mx-2">→</span><span className="text-emerald-600">{money(Number(entry.currentPrice), entry.currency)}</span></p></> : <><p className="font-semibold">{Number(entry.quantity).toLocaleString("en-AE")} {activityView === "sold" ? "sold" : activityView === "incoming" ? "incoming" : "received"}</p><p className="mt-1 text-xs text-muted-foreground">{money(Number(entry.price), entry.currency)} each</p></>}</TableCell>
                <TableCell className="text-right">{linkedDocument && entry.transactionId ? <Button type="button" size="sm" variant="outline" onClick={() => openActivityRecord(entry, "document")}><Eye className="size-4" />{activityView === "incoming" ? "View PO" : "View"}</Button> : <Button type="button" size="sm" variant="outline" onClick={() => openActivityRecord(entry, "item")}><Eye className="size-4" />Item</Button>}</TableCell>
              </TableRow>;
            }) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{activityEmpty}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">Incoming shows outstanding Purchase Order quantities. Open the PO to convert the remaining items to a Bill. New Arrival shows stock received through Enter Bill for 12 hours after saving. Price Change shows each item once with its latest change for 12 hours. Just Sold keeps the sales representative from the original sale.</div>
    </section>

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
          <div className="flex h-10 items-center rounded-lg border bg-white px-3"><Badge className="bg-slate-950 text-white hover:bg-slate-950">{selectedRecords.length} selected</Badge></div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-slate-700"><Checkbox checked={!showQuantity} onCheckedChange={(checked) => setShowQuantity(checked !== true)} />Hide quantity</label>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-slate-700"><Checkbox checked={!showPrice} onCheckedChange={(checked) => setShowPrice(checked !== true)} />Hide price</label>
          <div className="flex rounded-lg border bg-white p-1" aria-label="Shared price VAT format">
            <Button type="button" size="sm" variant={!includeVat ? "default" : "ghost"} disabled={!showPrice} onClick={() => setIncludeVat(false)} className={!includeVat ? "bg-slate-950 text-white hover:bg-slate-800" : ""}>No VAT</Button>
            <Button type="button" size="sm" variant={includeVat ? "default" : "ghost"} disabled={!showPrice} onClick={() => setIncludeVat(true)} className={includeVat ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : ""}>Including VAT</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border bg-white p-1"><Button size="sm" disabled={!canSelectItems || loading || !selectedRecords.length} onClick={() => copyForChannel("whatsapp")} title="Copy WhatsApp format" className="bg-[#25D366] text-white hover:bg-[#1fb558]"><MessageCircle />WhatsApp</Button></div>
          <div className="flex rounded-lg border bg-white p-1"><Button size="sm" disabled={!canSelectItems || loading || !selectedRecords.length} onClick={() => copyForChannel("telegram")} title="Copy Telegram format" className="bg-[#229ED9] text-white hover:bg-[#1987bb]"><Send />Telegram</Button></div>
          <div className="flex rounded-lg border bg-white p-1"><Button size="sm" variant="outline" disabled={!canSelectItems || loading || !selectedRecords.length} onClick={() => copyForChannel("email")} title="Copy email format"><Mail />Email</Button></div>
          <div className="flex rounded-lg border bg-white p-1"><Button size="sm" variant="outline" disabled={!canSelectItems || loading || !selectedRecords.length} onClick={() => exportExcel(false)}><Download />Excel no VAT</Button></div>
          <div className="flex rounded-lg border bg-white p-1"><Button size="sm" variant="outline" disabled={!canSelectItems || loading || !selectedRecords.length} onClick={() => exportExcel(true)}><FileSpreadsheet />Excel + VAT</Button></div>
        </div>
      </div>

      <div className="overflow-hidden">
        <Table className="w-full table-fixed">
          <TableHeader><TableRow className="bg-slate-50"><TableHead className="w-12"><span className="inline-flex rounded-lg border bg-white p-1.5"><Checkbox disabled={!canSelectItems || loading || !filtered.length} aria-label="Select all visible items" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /></span></TableHead><TableHead className="min-w-0 font-bold text-slate-900">Product specifications</TableHead>{showQuantity && <TableHead className="w-16 text-right font-bold text-slate-900 sm:w-24">Qty</TableHead>}{showPrice && <TableHead className="w-24 text-right font-bold text-slate-900 sm:w-36">Price</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading all inventories…</TableCell></TableRow> : categories.length === 0 ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-slate-500">No products match this view.</TableCell></TableRow> : categories.flatMap(([category, items]) => [
              <TableRow key={`category-${category}`} className="border-slate-800 bg-slate-950 hover:bg-slate-950"><TableCell colSpan={columnCount} className="py-3 font-bold text-white"><span className="mr-2 text-emerald-400">●</span>{category}<Badge className="ml-3 bg-white/15 text-white hover:bg-white/15">{items.length} items</Badge></TableCell></TableRow>,
              ...items.map((record) => {
                const out = Number(record.quantity) <= 0;
                const low = Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint);
                const description = inventoryItemLine(record.name, record.sku, specificationText(record), record.itemNumber);
                return <TableRow key={record.id} data-state={selectedIds.has(record.id) ? "selected" : undefined} className="align-top data-[state=selected]:bg-sky-50 hover:bg-slate-50/80">
                  <TableCell className="py-5"><span className="inline-flex rounded-lg border bg-white p-1.5"><Checkbox disabled={!canSelectItems || loading} aria-label={`Select ${record.name}`} checked={selectedIds.has(record.id)} onCheckedChange={(checked) => toggleSelected(record.id, checked === true)} /></span></TableCell>
                  <TableCell className="min-w-0 overflow-hidden py-4"><div className="flex min-w-0 max-w-full flex-col items-start gap-2 xl:flex-row xl:flex-wrap xl:items-center"><span className="block w-full max-w-full whitespace-normal break-words text-base font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 [overflow-wrap:anywhere]">{description}</span>{out ? <Badge className="bg-rose-500 text-white hover:bg-rose-500">Out of stock</Badge> : low ? <Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">Low stock</Badge> : null}<TooltipProvider>{record.inventories.map((inventory) => <Tooltip key={inventory.locationId}><TooltipTrigger asChild><Badge tabIndex={0} variant="outline" className="max-w-full cursor-help whitespace-normal border-sky-200 bg-sky-50 text-sky-800"><Warehouse className="mr-1 size-3 shrink-0" />{inventory.locationName}{inventory.locationCode ? ` · ${inventory.locationCode}` : ""}</Badge></TooltipTrigger><TooltipContent sideOffset={6}>Qty: {Number(inventory.quantity).toLocaleString()}</TooltipContent></Tooltip>)}</TooltipProvider></div><div className="mt-3 flex min-w-0 flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDetailRecord(record)} aria-label={`View product customization details for ${record.name}`}><PackageOpen className="size-4" />Customization Details</Button><Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">{receivedAge(record.latestReceivedAt)}</Badge></div></TableCell>
                  {showQuantity && <TableCell className={`break-words py-4 text-right text-sm font-black sm:text-base ${out ? "text-rose-600" : low ? "text-amber-600" : "text-slate-900"}`}>{Number(record.quantity).toLocaleString()}</TableCell>}
                  {showPrice && <TableCell className="break-words py-4 text-right text-sm font-black text-rose-600 sm:text-base [overflow-wrap:anywhere]">{money(Number(record.salesPrice) * (includeVat ? 1.05 : 1), record.currency)}{includeVat && <span className="mt-1 block text-[11px] font-semibold text-emerald-600">VAT included</span>}</TableCell>}
                </TableRow>;
              }),
            ])}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Showing {filtered.length} products</span><span>{totals.healthy} healthy · {totals.low} low stock</span></div>
    </section>

    <Dialog open={Boolean(detailRecord)} onOpenChange={(open) => { if (!open) setDetailRecord(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Product Customization Details</DialogTitle><DialogDescription>{detailRecord ? `${detailRecord.name} · SKU ${detailRecord.sku} · Item #${detailRecord.itemNumber || "—"}` : "Product details"}</DialogDescription></DialogHeader>{detailRecord ? <div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">{receivedAge(detailRecord.latestReceivedAt)}</Badge>{detailRecord.inventories.map((inventory) => <Badge key={inventory.locationId} variant="outline">{inventory.locationName} · Qty {Number(inventory.quantity).toLocaleString()}</Badge>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["RAM", detailRecord.customizationRam || specificationValue(detailRecord, ["RAM", "Memory"])], ["Storage", detailRecord.customizationStorage || specificationValue(detailRecord, ["Storage", "SSD", "Hard Drive"])], ["Part Number", detailRecord.partNumber || specificationValue(detailRecord, ["Part Number", "MPN"])], ["Serial", detailRecord.itemSerialNumber], ["UPC No.", detailRecord.upcNumber], ["Quantity on hand", Number(detailRecord.quantity).toLocaleString()]].map(([label, value]) => <div key={label} className="rounded-lg border bg-muted/20 p-3"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-1 break-words font-semibold">{value || "Not entered"}</p></div>)}</div><div className="rounded-lg border p-4"><h4 className="font-semibold">Full product specifications</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{specificationText(detailRecord) || "No specifications entered."}</p></div><div className="rounded-lg border p-4"><h4 className="font-semibold">Details for users</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{detailRecord.customizationDetails || "No customization details entered."}</p></div></div> : null}</DialogContent></Dialog>
  </div>;
}
