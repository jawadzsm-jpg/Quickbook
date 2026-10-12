"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2, Undo2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemSearchSelect, itemSearchDetail, itemSearchFields } from "./item-search-select";

type WarehouseOption = { id: number; name: string; code: string; isDefault: boolean; active: boolean };
type Share = { warehouseId: number; name: string; quantity: number };
type StockItem = Record<string, unknown> & { id: number; sku: string; name: string; itemType?: string; quantity: number; warehouses?: Share[] };
type Move = { id: number; itemId: number; sku: string; name: string; fromWarehouseId: number; toWarehouseId: number; quantity: number; reference: string; transferDate: string; notes: string; createdByName: string };
type Line = { key: string; itemId: string; quantity: string };

const newLine = (): Line => ({ key: crypto.randomUUID(), itemId: "", quantity: "1" });
const formatQuantity = (value: number) => value.toLocaleString("en-AE", { maximumFractionDigits: 2 });

/**
 * Transfers → Move between warehouses of the active inventory. Shown only when that inventory has two or more active
 * warehouses. Moves change warehouse stock only; the inventory total, cost and ledger stay the same.
 */
export function WarehouseTransfers({ companyId, locationId, locationName, onMoved }: { companyId: number; locationId: number; locationName: string; onMoved?: () => void }) {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [warehouseResponse, itemResponse, moveResponse] = await Promise.all([
        fetch(`/api/warehouses?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" }),
        fetch(`/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" }),
        fetch(`/api/warehouse-transfers?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" }),
      ]);
      const warehouseData = warehouseResponse.ok ? await warehouseResponse.json() : { warehouses: [] };
      const itemData = itemResponse.ok ? await itemResponse.json() : { records: [] };
      const moveData = moveResponse.ok ? await moveResponse.json() : { transfers: [] };
      const list = (warehouseData.warehouses as WarehouseOption[]).filter((warehouse) => warehouse.active);
      setWarehouses(list);
      setStock((itemData.records as StockItem[]).filter((item) => (item.itemType ?? "stock-part") === "stock-part"));
      setMoves(moveData.transfers as Move[]);
      setFromId((current) => list.some((warehouse) => String(warehouse.id) === current) ? current : String(list.find((warehouse) => warehouse.isDefault)?.id ?? list[0]?.id ?? ""));
      setToId((current) => list.some((warehouse) => String(warehouse.id) === current) ? current : String(list.find((warehouse) => !warehouse.isDefault)?.id ?? ""));
    } catch { toast.error("Could not load warehouse stock."); }
  }, [companyId, locationId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const inFrom = useCallback((item: StockItem) => item.warehouses?.find((share) => String(share.warehouseId) === fromId)?.quantity ?? 0, [fromId]);
  const options = useMemo(() => stock.filter((item) => inFrom(item) > 0).map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name} · ${formatQuantity(inFrom(item))} here`, detail: itemSearchDetail(item), search: itemSearchFields(item) })), [stock, inFrom]);
  const nameOf = (id: number) => warehouses.find((warehouse) => warehouse.id === id)?.name ?? `Warehouse #${id}`;

  if (warehouses.length < 2) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const filled = lines.filter((line) => line.itemId);
    if (!filled.length) return toast.error("Add at least one product to move.");
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, locationId, fromWarehouseId: Number(fromId), toWarehouseId: Number(toId), reference, notes, lines: filled.map((line) => ({ itemId: Number(line.itemId), quantity: Number(line.quantity) })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not move the stock.");
      toast.success(`Moved ${filled.length} ${filled.length === 1 ? "product" : "products"} from ${nameOf(Number(fromId))} to ${nameOf(Number(toId))}`);
      setLines([newLine()]); setReference(""); setNotes("");
      await load(); onMoved?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not move the stock."); }
    finally { setBusy(false); }
  }

  async function reverse(move: Move) {
    if (!window.confirm(`Reverse move ${move.reference}? ${formatQuantity(move.quantity)} × ${move.sku} goes back from ${nameOf(move.toWarehouseId)} to ${nameOf(move.fromWarehouseId)}.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse-transfers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: move.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reverse the move.");
      toast.success("Move reversed");
      await load(); onMoved?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not reverse the move."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border bg-card text-card-foreground shadow-sm" aria-label="Move stock between warehouses">
    <header className="flex flex-wrap items-start gap-3 border-b p-4 sm:p-5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Warehouse className="size-5" /></div>
      <div className="min-w-0 flex-1 basis-60"><h2 className="font-bold">Move between warehouses · {locationName}</h2><p className="text-sm text-muted-foreground">Moves stock inside this inventory. The inventory total, cost and accounts do not change.</p></div>
    </header>
    <form onSubmit={submit} className="space-y-3 p-4 sm:p-5">
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid min-w-0 gap-1.5 text-sm">From<select className="h-9 min-w-0 rounded-md border bg-background px-2" value={fromId} onChange={(event) => { setFromId(event.target.value); if (event.target.value === toId) setToId(fromId); setLines([newLine()]); }}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " (default)" : ""}</option>)}</select></label>
        <ArrowRight className="mb-2.5 hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
        <label className="grid min-w-0 gap-1.5 text-sm">To<select className="h-9 min-w-0 rounded-md border bg-background px-2" value={toId} onChange={(event) => setToId(event.target.value)}>{warehouses.filter((warehouse) => String(warehouse.id) !== fromId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " (default)" : ""}</option>)}</select></label>
        <label className="col-span-2 grid min-w-0 gap-1.5 text-sm md:col-span-1">Reference<Input value={reference} maxLength={40} onChange={(event) => setReference(event.target.value.toUpperCase())} placeholder="Automatic" /></label>
      </div>
      <div className="space-y-2">{lines.map((line, index) => {
        const item = stock.find((entry) => String(entry.id) === line.itemId);
        return <div key={line.key} className="flex flex-wrap items-start gap-2 rounded-lg border p-2">
          <div className="min-w-0 flex-1 basis-64"><ItemSearchSelect ariaLabel={`Product for line ${index + 1}`} value={line.itemId} onValueChange={(itemId) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, itemId } : entry))} options={options} placeholder={options.length ? "Select product" : "No stock in this warehouse"} /></div>
          <div className="w-28"><Input aria-label={`Quantity for line ${index + 1}`} type="number" min="0.01" step="0.01" max={item ? inFrom(item) : undefined} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, quantity: event.target.value } : entry))} required /><p className="mt-1 text-xs text-muted-foreground">Here: {item ? formatQuantity(inFrom(item)) : "—"}</p></div>
          <Button type="button" variant="ghost" size="icon" className="size-9 text-rose-600" disabled={lines.length === 1} aria-label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 className="size-4" /></Button>
        </div>;
      })}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])} disabled={lines.length >= 100}><Plus className="size-4" />Add line</Button>
        <Input aria-label="Notes" className="h-9 min-w-0 flex-1 basis-48" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" />
        <Button type="submit" disabled={busy || !fromId || !toId}>{busy ? "Moving…" : "Move stock"}</Button>
      </div>
    </form>
    {moves.length > 0 && <div className="border-t p-4 sm:p-5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Recent moves</Label>
      <ul className="mt-2 divide-y rounded-lg border text-sm">{moves.slice(0, 20).map((move) => <li key={move.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{move.transferDate}</span>
        <span className="font-mono text-xs">{move.reference}</span>
        <span className="min-w-0 flex-1 basis-40 truncate" title={move.name}>{move.sku} · {move.name}</span>
        <span className="whitespace-nowrap text-xs">{nameOf(move.fromWarehouseId)} → {nameOf(move.toWarehouseId)}</span>
        <span className="font-semibold tabular-nums">{formatQuantity(move.quantity)}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void reverse(move)}><Undo2 className="size-3.5" />Reverse</Button>
      </li>)}</ul>
    </div>}
  </section>;
}
