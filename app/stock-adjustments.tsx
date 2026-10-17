"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History, PackagePlus, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { matchesSearch } from "@/lib/search";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { ItemSearchSelect, itemSearchDetail, itemSearchFields } from "./item-search-select";
import { MAX_ADJUSTMENT_LINES, adjustmentTotals, adjustmentTypeLabels, adjustmentTypes, changesQuantity, changesValue, planAdjustmentLine, roundMoney, type AdjustmentLinePlan, type AdjustmentType } from "@/lib/stock-adjustment";

type StockItem = { id: number; sku: string; itemNumber: string; name: string; description: string; category: string; partNumber: string; upcNumber: string; quantity: number; warehouseQuantity: number; unitCost: number; assetAccount: string };
type Account = { id: number; code: string; name: string; type: string; currency: string; systemRole: string | null };
type HistoryLine = { itemId: number | null; description: string; quantityOnHand: number; newQuantity: number; quantityDifference: number; currentValue: number; newValue: number; valueDifference: number; newUnitCost: number };
type Adjustment = { id: number; reference: string; date: string; type: AdjustmentType; account: string; memo: string; currency: string; exchangeRate: number; totalValue: number; documentTotal: number; locationName: string; lines: HistoryLine[] };
type Workspace = {
  company: { id: number; name: string; baseCurrency: string }; locations: Array<{ id: number; name: string }>; locationId: number;
  warehouses: Array<{ id: number; name: string; isDefault: boolean }>; warehouseId: number | null; accounts: Account[]; defaultAccountId: number | null;
  exchangeRates: Array<{ currency: string; rate: number }>; items: StockItem[]; adjustments: Adjustment[]; nextReference: string; today: string;
};
/** A line as typed: quantity cells and the new total value (document currency). */
type Draft = { itemId: number; newQuantity: string; quantityDifference: string; newValue: string };

const formatNumber = (value: number, digits = 2) => value.toLocaleString("en-AE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatQuantity = (value: number) => value.toLocaleString("en-AE", { maximumFractionDigits: 6 });
const signed = (value: number, digits = 2) => `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
const tone = (value: number) => value > 0 ? "text-emerald-700 dark:text-emerald-300" : value < 0 ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground";
const cellInput = "h-8 min-w-0 text-right tabular-nums";

export function StockAdjustments({ companyId, companyName }: { companyId: number; companyName: string }) {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState(0);
  const [warehouseId, setWarehouseId] = useState(0);
  const [type, setType] = useState<AdjustmentType>("quantity");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [accountId, setAccountId] = useState(0);
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("1");
  const [memo, setMemo] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeItemId, setActiveItemId] = useState(0);
  const [picker, setPicker] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Adjustment | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (location = 0, warehouse = 0, keepForm = false) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyId: String(companyId) });
      if (location) query.set("locationId", String(location));
      if (warehouse) query.set("warehouseId", String(warehouse));
      const response = await fetch(`/api/stock-adjustments?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load stock adjustments");
      const next = result as Workspace;
      setData(next);
      setLocationId(next.locationId);
      setWarehouseId(next.warehouseId ?? 0);
      setReference(next.nextReference);
      if (!keepForm) {
        setDate(next.today); setAccountId(next.defaultAccountId ?? 0); setCurrency(next.company.baseCurrency); setRate("1"); setMemo("");
      }
      setDrafts((current) => current.filter((draft) => next.items.some((item) => item.id === draft.itemId)));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load stock adjustments"); }
    finally { setLoading(false); }
  }, [companyId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const home = data?.company.baseCurrency ?? "";
  const exchangeRate = currency === home ? 1 : Number(rate);
  const validRate = Number.isFinite(exchangeRate) && exchangeRate > 0;
  const itemById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item])), [data]);
  const warehouse = data?.warehouses.find((entry) => entry.id === warehouseId);
  const multiWarehouse = (data?.warehouses.length ?? 0) > 1;
  // Value adjustments change the whole inventory; quantity adjustments the selected warehouse.
  const onHandOf = useCallback((item: StockItem) => changesValue(type) ? item.quantity : item.warehouseQuantity, [type]);
  const rows = useMemo(() => drafts.map((draft) => {
    const item = itemById.get(draft.itemId);
    if (!item) return null;
    const touched = (changesQuantity(type) && (draft.newQuantity.trim() || draft.quantityDifference.trim())) || (changesValue(type) && draft.newValue.trim());
    const plan = touched && validRate ? planAdjustmentLine(type, { quantity: onHandOf(item), unitCost: item.unitCost }, { newQuantity: draft.newQuantity, quantityDifference: draft.newQuantity.trim() ? undefined : draft.quantityDifference, newValue: draft.newValue }, exchangeRate) : null;
    return { draft, item, plan: plan && !("error" in plan) ? plan : null, error: plan && "error" in plan ? plan.error : touched ? "" : "Enter the adjustment" };
  }).filter((row): row is { draft: Draft; item: StockItem; plan: AdjustmentLinePlan | null; error: string } => Boolean(row)), [drafts, itemById, type, validRate, exchangeRate, onHandOf]);
  const ready = rows.filter((row) => row.plan).map((row) => row.plan!);
  const totals = adjustmentTotals(ready);
  const toDocument = (homeValue: number) => validRate ? roundMoney(homeValue / exchangeRate) : 0;

  const skuLock = useSkuLock(drafts.length ? { resource: "stock-adjustments", lines: [...drafts].sort((a, b) => a.itemId - b.itemId).map((draft) => ({ itemId: draft.itemId })) } : null);

  function addItems(ids: number[]) {
    setDrafts((current) => {
      const existing = new Set(current.map((draft) => draft.itemId));
      const added = ids.filter((id) => !existing.has(id)).map((itemId) => ({ itemId, newQuantity: "", quantityDifference: "", newValue: "" }));
      if (current.length + added.length > MAX_ADJUSTMENT_LINES) { toast.error(`An adjustment can have up to ${MAX_ADJUSTMENT_LINES} items.`); return current; }
      return [...current, ...added];
    });
    if (ids.length) setActiveItemId(ids[ids.length - 1]);
  }
  const update = (itemId: number, field: keyof Omit<Draft, "itemId">, value: string) => setDrafts((current) => current.map((draft) => {
    if (draft.itemId !== itemId) return draft;
    const item = itemById.get(itemId);
    const next = { ...draft, [field]: value };
    // New quantity and difference stay in step, as in a stock count sheet.
    if (item && field === "newQuantity") next.quantityDifference = value.trim() && Number.isFinite(Number(value)) ? String(Math.round((Number(value) - onHandOf(item)) * 1e6) / 1e6) : "";
    if (item && field === "quantityDifference") next.newQuantity = value.trim() && Number.isFinite(Number(value)) ? String(Math.round((onHandOf(item) + Number(value)) * 1e6) / 1e6) : "";
    return next;
  }));
  const remove = (itemId: number) => setDrafts((current) => current.filter((draft) => draft.itemId !== itemId));
  function changeType(next: AdjustmentType) {
    setType(next);
    // Quantities typed against one basis would be wrong against the other, so they are cleared when the basis changes.
    if (changesValue(next) !== changesValue(type)) setDrafts((current) => current.map((draft) => ({ ...draft, newQuantity: "", quantityDifference: "" })));
    if (changesValue(next) && warehouse && !warehouse.isDefault) {
      const fallback = data?.warehouses.find((entry) => entry.isDefault);
      if (fallback) { setWarehouseId(fallback.id); void load(locationId, fallback.id, true); }
    }
  }
  function changeCurrency(next: string) {
    setCurrency(next);
    setRate(next === home ? "1" : String(data?.exchangeRates.find((entry) => entry.currency === next)?.rate ?? ""));
  }
  function clearForm() { setDrafts([]); setMemo(""); setActiveItemId(0); }

  async function save() {
    if (!data) return;
    if (!drafts.length) return toast.error("Add at least one item.");
    if (!accountId) return toast.error("Choose the adjustment account.");
    if (!validRate) return toast.error("Enter a positive exchange rate.");
    const problem = rows.find((row) => !row.plan);
    if (problem) return toast.error(`${problem.item.sku} · ${problem.item.name}: ${problem.error || "Enter the adjustment"}`);
    if (!skuLock.ready) return toast.error(skuLock.message || "Checking SKU availability…");
    setSaving(true);
    try {
      const response = await fetch("/api/stock-adjustments", {
        method: "POST", headers: { "Content-Type": "application/json", ...skuLock.headers },
        body: JSON.stringify({ companyId, locationId, warehouseId: warehouseId || undefined, type, date, reference, accountId, currency, exchangeRate, memo, lines: rows.map(({ draft, item }) => ({ itemId: item.id, expectedQuantity: onHandOf(item), newQuantity: changesQuantity(type) ? draft.newQuantity : undefined, quantityDifference: changesQuantity(type) && !draft.newQuantity.trim() ? draft.quantityDifference : undefined, newValue: changesValue(type) ? draft.newValue : undefined })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the adjustment");
      toast.success(`${result.adjustment.reference} saved · ${result.adjustment.lineCount} item${result.adjustment.lineCount === 1 ? "" : "s"} · ${home} ${signed(result.adjustment.totalValue)}`);
      clearForm();
      await load(locationId, warehouseId, true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the adjustment"); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!removing) return;
    if (!reason.trim()) return toast.error("Write a reason for deleting the adjustment.");
    setSaving(true);
    try {
      const response = await fetch("/api/stock-adjustments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: removing.id, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the adjustment");
      toast.success(`${removing.reference} deleted · stock and ledger reversed`);
      setRemoving(null); setReason("");
      await load(locationId, warehouseId, true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete the adjustment"); }
    finally { setSaving(false); }
  }

  const accountGroups = useMemo(() => {
    const groups = new Map<string, Account[]>();
    for (const account of data?.accounts ?? []) groups.set(account.type, [...(groups.get(account.type) ?? []), account]);
    return [...groups.entries()];
  }, [data]);
  const currencies = [home, ...(data?.exchangeRates ?? []).map((entry) => entry.currency).filter((code) => code !== home)].filter(Boolean);
  const active = rows.find((row) => row.item.id === activeItemId);
  const afterQuantity = active ? active.plan?.newQuantity ?? onHandOf(active.item) : 0;
  const afterValue = active ? active.plan?.newValue ?? roundMoney(onHandOf(active.item) * active.item.unitCost) : 0;
  const afterCost = active ? active.plan?.newUnitCost ?? active.item.unitCost : 0;
  const options = useMemo(() => (data?.items ?? []).filter((item) => !drafts.some((draft) => draft.itemId === item.id)).map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}`, detail: [itemSearchDetail(item), `On hand ${formatQuantity(changesValue(type) ? item.quantity : item.warehouseQuantity)}`].filter(Boolean).join(" · "), search: itemSearchFields(item) })), [data, drafts, type]);
  const foreign = currency !== home;

  return <div className="min-w-0 space-y-4">
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
        <div className="flex min-w-0 gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><SlidersHorizontal className="size-5" /></div>
          <div className="min-w-0"><h2 className="text-lg font-semibold">Adjust Quantity/Value on Hand</h2><p className="text-sm text-muted-foreground">Correct stock for {companyName}: many items at once, in any company currency. Each adjustment posts stock movements and a balanced journal to the adjustment account.</p></div></div>
        <div role="tablist" aria-label="Stock adjustment views" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === "new" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><PackagePlus className="size-4" />New adjustment</button>
          <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === "history" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><History className="size-4" />History{data ? ` (${data.adjustments.length})` : ""}</button>
        </div>
      </header>

      {tab === "new" ? <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor="adj-type">Adjustment type</Label><NativeSelect id="adj-type" className="w-full" value={type} onChange={(event) => changeType(event.target.value as AdjustmentType)} disabled={saving}>{adjustmentTypes.map((entry) => <NativeSelectOption key={entry} value={entry}>{adjustmentTypeLabels[entry]}</NativeSelectOption>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="adj-date">Adjustment date</Label><Input id="adj-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving} /></div>
          <div className="space-y-1.5"><Label htmlFor="adj-ref">Reference no.</Label><Input id="adj-ref" value={reference} maxLength={40} onChange={(event) => setReference(event.target.value)} disabled={saving} /></div>
          <div className="space-y-1.5"><Label htmlFor="adj-account">Adjustment account</Label><NativeSelect id="adj-account" className="w-full" value={accountId || ""} onChange={(event) => setAccountId(Number(event.target.value))} disabled={saving || loading}><NativeSelectOption value="">Choose account…</NativeSelectOption>{accountGroups.map(([group, list]) => <NativeSelectOptGroup key={group} label={group}>{list.map((account) => <NativeSelectOption key={account.id} value={account.id}>{account.code} · {account.name} · {account.currency}</NativeSelectOption>)}</NativeSelectOptGroup>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="adj-location">Inventory</Label><NativeSelect id="adj-location" className="w-full" value={locationId || ""} onChange={(event) => { setDrafts([]); void load(Number(event.target.value), 0, true); }} disabled={saving || loading || drafts.length > 0} title={drafts.length ? "Clear the lines to change inventory" : undefined}>{data?.locations.map((location) => <NativeSelectOption key={location.id} value={location.id}>{location.name}</NativeSelectOption>)}</NativeSelect></div>
          {multiWarehouse && <div className="space-y-1.5"><Label htmlFor="adj-warehouse">Warehouse</Label><NativeSelect id="adj-warehouse" className="w-full" value={warehouseId || ""} onChange={(event) => { setDrafts([]); void load(locationId, Number(event.target.value), true); }} disabled={saving || loading || drafts.length > 0 || changesValue(type)} title={changesValue(type) ? "Value adjustments use the whole inventory (default warehouse)" : undefined}>{data?.warehouses.map((entry) => <NativeSelectOption key={entry.id} value={entry.id}>{entry.name}{entry.isDefault ? " (default)" : ""}</NativeSelectOption>)}</NativeSelect></div>}
          <div className="space-y-1.5"><Label htmlFor="adj-currency">Currency</Label><NativeSelect id="adj-currency" className="w-full" value={currency} onChange={(event) => changeCurrency(event.target.value)} disabled={saving}>{currencies.map((code) => <NativeSelectOption key={code} value={code}>{code}{code === home ? " (home)" : ""}</NativeSelectOption>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="adj-rate">Exchange rate {foreign ? `(1 ${currency} = ? ${home})` : ""}</Label><Input id="adj-rate" type="number" min="0" step="any" className="tabular-nums" value={foreign ? rate : "1"} onChange={(event) => setRate(event.target.value)} disabled={saving || !foreign} aria-invalid={!validRate} /></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setPicker(true)} disabled={saving || loading || !data?.items.length}><Search className="size-4" />Find &amp; Select Items…</Button>
          <ItemSearchSelect className="w-full sm:w-80" value="" onValueChange={(value) => addItems([Number(value)])} options={options} placeholder="Add an item…" ariaLabel="Add an item to the adjustment" disabled={saving || loading} companyId={companyId} />
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => void load(locationId, warehouseId, true)} disabled={saving || loading}><RefreshCw className="size-4" />Reload stock</Button>
        </div>
        <SkuLockNotice message={skuLock.message} />

        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qty on hand</th>
                {changesQuantity(type) && <><th className="w-32 px-3 py-2 text-right font-semibold">New quantity</th><th className="w-32 px-3 py-2 text-right font-semibold">Qty difference</th></>}
                <th className="px-3 py-2 text-right font-semibold">Current value<span className="block font-normal normal-case">{currency}</span></th>
                {changesValue(type) && <th className="w-36 px-3 py-2 text-right font-semibold">New value<span className="block font-normal normal-case">{currency}</span></th>}
                <th className="px-3 py-2 text-right font-semibold">Value difference<span className="block font-normal normal-case">{currency}</span></th>
                <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !data ? <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading stock…</td></tr>
                : !rows.length ? <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No items yet. Use <span className="font-medium text-foreground">Find &amp; Select Items</span> to pick several, or add one item from the search.</td></tr>
                : rows.map(({ draft, item, plan, error }, index) => {
                  const onHand = onHandOf(item);
                  const current = roundMoney(onHand * item.unitCost);
                  return <tr key={item.id} onFocusCapture={() => setActiveItemId(item.id)} onClick={() => setActiveItemId(item.id)} className={`${index % 2 ? "bg-sky-50/40 dark:bg-sky-950/10" : ""} ${activeItemId === item.id ? "outline outline-2 -outline-offset-2 outline-primary/40" : ""} align-top`}>
                    <td className="px-3 py-2"><p className="font-semibold text-blue-700 dark:text-blue-300">{item.sku} · {item.name}</p><p className="line-clamp-1 text-xs text-muted-foreground">{item.description || item.category}</p>{error && (draft.newQuantity || draft.quantityDifference || draft.newValue) ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatQuantity(onHand)}</td>
                    {changesQuantity(type) && <><td className="px-3 py-1.5"><Input className={cellInput} type="number" min="0" step="any" aria-label={`New quantity for ${item.sku}`} value={draft.newQuantity} onChange={(event) => update(item.id, "newQuantity", event.target.value)} disabled={saving} /></td>
                      <td className="px-3 py-1.5"><Input className={cellInput} type="number" step="any" aria-label={`Quantity difference for ${item.sku}`} value={draft.quantityDifference} onChange={(event) => update(item.id, "quantityDifference", event.target.value)} disabled={saving} /></td></>}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatNumber(toDocument(current))}</td>
                    {changesValue(type) && <td className="px-3 py-1.5"><Input className={cellInput} type="number" min="0" step="0.01" aria-label={`New total value in ${currency} for ${item.sku}`} value={draft.newValue} onChange={(event) => update(item.id, "newValue", event.target.value)} disabled={saving} /></td>}
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone(plan?.valueDifference ?? 0)}`}>{plan ? signed(toDocument(plan.valueDifference)) : "—"}</td>
                    <td className="px-2 py-1.5 text-right"><Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remove ${item.sku}`} onClick={(event) => { event.stopPropagation(); remove(item.id); }} disabled={saving}><X className="size-4" /></Button></td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_minmax(0,20rem)]">
          <div className="space-y-1.5 md:col-span-2 2xl:col-span-1"><Label htmlFor="adj-memo">Memo</Label><Textarea id="adj-memo" rows={3} maxLength={1000} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Reason for the adjustment, e.g. annual stock count, damaged goods" disabled={saving} /></div>
          <div className="rounded-xl border p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Item info after adjustment</p>
            {active ? <dl className="mt-2 space-y-1.5">
              <p className="truncate font-medium">{active.item.sku} · {active.item.name}</p>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Quantity on hand</dt><dd className="font-semibold tabular-nums">{formatQuantity(afterQuantity)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Avg cost per item ({home})</dt><dd className="font-semibold tabular-nums">{formatNumber(afterCost)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Value ({home})</dt><dd className="font-semibold tabular-nums">{formatNumber(afterValue)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Asset account</dt><dd className="truncate text-right">{active.item.assetAccount || "Not linked"}</dd></div>
            </dl> : <p className="mt-2 text-muted-foreground">Select a line to see its quantity, average cost and value after the adjustment.</p>}
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/30 p-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total value of adjustment</dt><dd className={`font-bold tabular-nums ${tone(totals.totalValue)}`}>{currency} {signed(toDocument(totals.totalValue))}</dd></div>
              {foreign && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">In home currency</dt><dd className={`font-semibold tabular-nums ${tone(totals.totalValue)}`}>{home} {signed(totals.totalValue)}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Number of item adjustments</dt><dd className="font-bold tabular-nums">{ready.length}{rows.length !== ready.length ? ` of ${rows.length}` : ""}</dd></div>
            </dl>
            <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={clearForm} disabled={saving || !drafts.length}>Clear</Button><Button type="button" className="flex-1" onClick={() => void save()} disabled={saving || loading || !drafts.length || !skuLock.ready}>{saving ? "Saving…" : "Save & New"}</Button></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Quantity adjustments are valued at each item&apos;s average cost ({home}). Total Value adjustments set the inventory value and the item&apos;s saved cost; they apply to the whole inventory. Dates in a filed VAT or tax period need the Admin PIN.</p>
      </div>

      : <div className="p-4 sm:p-5">
        {!data?.adjustments.length ? <p className="py-8 text-center text-sm text-muted-foreground">No stock adjustments yet for {companyName}.</p> : <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="w-8 px-2 py-2" /><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Inventory</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Items</th><th className="px-3 py-2 text-right">Total value</th><th className="w-10 px-2 py-2"><span className="sr-only">Delete</span></th></tr></thead>
            <tbody className="divide-y">{data.adjustments.map((entry) => <AdjustmentRow key={entry.id} entry={entry} home={home} open={expanded === entry.id} onToggle={() => setExpanded((current) => current === entry.id ? null : entry.id)} onDelete={() => { setReason(""); setRemoving(entry); }} />)}</tbody>
          </table>
        </div>}
      </div>}
    </section>

    <ItemPicker open={picker} onOpenChange={setPicker} items={(data?.items ?? []).filter((item) => !drafts.some((draft) => draft.itemId === item.id))} onHand={onHandOf} home={home} onAdd={(ids) => { addItems(ids); setPicker(false); }} />

    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete {removing?.reference}?</DialogTitle><DialogDescription>The stock quantities and the journal of this adjustment are reversed. The audit log keeps a record with your reason.</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="adj-reason">Reason</Label><Textarea id="adj-reason" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setRemoving(null)} disabled={saving}>Cancel</Button><Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={saving || !reason.trim()}>{saving ? "Deleting…" : "Delete adjustment"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function AdjustmentRow({ entry, home, open, onToggle, onDelete }: { entry: Adjustment; home: string; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const foreign = entry.currency !== home;
  return <>
    <tr className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
      <td className="px-2 py-2 text-muted-foreground">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
      <td className="px-3 py-2 tabular-nums">{entry.date}</td>
      <td className="px-3 py-2 font-semibold">{entry.reference}</td>
      <td className="px-3 py-2"><Badge variant="secondary">{adjustmentTypeLabels[entry.type]}</Badge></td>
      <td className="px-3 py-2">{entry.locationName}</td>
      <td className="px-3 py-2">{entry.account}</td>
      <td className="px-3 py-2 text-right tabular-nums">{entry.lines.length}</td>
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone(entry.totalValue)}`}>{home} {signed(entry.totalValue)}{foreign && <span className="block text-xs font-normal text-muted-foreground">{entry.currency} {signed(entry.documentTotal)} @ {entry.exchangeRate}</span>}</td>
      <td className="px-2 py-1.5 text-right"><Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Delete ${entry.reference}`} onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 className="size-4" /></Button></td>
    </tr>
    {open && <tr className="bg-muted/20"><td colSpan={9} className="px-4 py-3">
      {entry.memo && <p className="mb-2 text-sm"><span className="text-muted-foreground">Memo: </span>{entry.memo}</p>}
      <table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="py-1 text-left">Item</th><th className="py-1 text-right">Qty before</th><th className="py-1 text-right">Qty after</th><th className="py-1 text-right">Qty diff.</th><th className="py-1 text-right">Value before ({home})</th><th className="py-1 text-right">Value after ({home})</th><th className="py-1 text-right">Value diff. ({home})</th></tr></thead>
        <tbody>{entry.lines.map((line, index) => <tr key={index} className="border-t"><td className="py-1">{line.description}</td><td className="py-1 text-right tabular-nums">{formatQuantity(line.quantityOnHand)}</td><td className="py-1 text-right tabular-nums">{formatQuantity(line.newQuantity)}</td><td className={`py-1 text-right tabular-nums ${tone(line.quantityDifference)}`}>{line.quantityDifference > 0 ? "+" : ""}{formatQuantity(line.quantityDifference)}</td><td className="py-1 text-right tabular-nums">{formatNumber(line.currentValue)}</td><td className="py-1 text-right tabular-nums">{formatNumber(line.newValue)}</td><td className={`py-1 text-right font-semibold tabular-nums ${tone(line.valueDifference)}`}>{signed(line.valueDifference)}</td></tr>)}</tbody>
      </table>
    </td></tr>}
  </>;
}

function ItemPicker({ open, onOpenChange, items, onHand, home, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; items: StockItem[]; onHand: (item: StockItem) => number; home: string; onAdd: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const visible = useMemo(() => items.filter((item) => matchesSearch(itemSearchFields(item), query)).slice(0, 500), [items, query]);
  const toggle = (id: number, checked: boolean) => setChosen((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  const close = (next: boolean) => { if (!next) { setQuery(""); setChosen(new Set()); } onOpenChange(next); };
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>Find &amp; Select Items</DialogTitle><DialogDescription>Tick the items to adjust. Search by SKU, item no., name, part number or UPC.</DialogDescription></DialogHeader>
      <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items…" aria-label="Search items" />
      <div className="relative max-h-[55vh] overflow-auto rounded-lg border" data-native-export>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="w-10 px-2 py-2"><Checkbox aria-label="Select all shown items" checked={visible.length > 0 && visible.every((item) => chosen.has(item.id))} onCheckedChange={(checked) => setChosen((current) => { const next = new Set(current); visible.forEach((item) => { if (checked === true) next.add(item.id); else next.delete(item.id); }); return next; })} /></th><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-right">On hand</th><th className="px-2 py-2 text-right">Avg cost ({home})</th></tr></thead>
          <tbody className="divide-y">{visible.length ? visible.map((item) => <tr key={item.id} className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(item.id, !chosen.has(item.id))}>
            <td className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Select ${item.sku}`} checked={chosen.has(item.id)} onCheckedChange={(checked) => toggle(item.id, checked === true)} /></td>
            <td className="px-2 py-1.5"><p className="font-medium">{item.sku} · {item.name}</p><p className="text-xs text-muted-foreground">{[itemSearchDetail(item), item.category].filter(Boolean).join(" · ")}</p></td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatQuantity(onHand(item))}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(item.unitCost)}</td>
          </tr>) : <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No matching items.</td></tr>}</tbody>
        </table>
      </div>
      <DialogFooter><span className="mr-auto self-center text-sm text-muted-foreground">{chosen.size} selected</span><Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button><Button type="button" disabled={!chosen.size} onClick={() => { onAdd([...chosen]); setQuery(""); setChosen(new Set()); }}>Add {chosen.size || ""} item{chosen.size === 1 ? "" : "s"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
