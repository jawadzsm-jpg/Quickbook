"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Star, Trash2, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmDelete } from "./confirm-delete-dialog";

type WarehouseRow = { id: number; code: string; name: string; isDefault: boolean; active: boolean; itemCount: number; quantity: number };

const quantity = (value: number) => value.toLocaleString("en-AE", { maximumFractionDigits: 2 });

/** Management → Inventories: the warehouses inside one inventory. The default warehouse holds stock not placed in another warehouse. */
export function WarehouseManager({ companyId, locationId, locationName, multiWarehouse = true }: { companyId: number; locationId: number; locationName: string; multiWarehouse?: boolean }) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const [rows, setRows] = useState<WarehouseRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", code: "" });
  const [editing, setEditing] = useState<{ id: number; name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/warehouses?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load warehouses.");
      setRows(data.warehouses as WarehouseRow[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load warehouses."); setRows([]); }
  }, [companyId, locationId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // A one-warehouse EasyBook edition hides Add and Activate once a warehouse is active (the API enforces the same limit).
  const canActivateMore = multiWarehouse || !rows?.some((row) => row.active);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/warehouses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the warehouse.");
      toast.success(success);
      await load();
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the warehouse."); return false; }
    finally { setBusy(false); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await send("POST", { locationId, name: draft.name, code: draft.code }, `Warehouse "${draft.name.trim()}" added`)) { setDraft({ name: "", code: "" }); setAdding(false); }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (editing && await send("PATCH", { id: editing.id, action: "update", name: editing.name, code: editing.code }, "Warehouse updated")) setEditing(null);
  }
  const makeDefault = (row: WarehouseRow) => {
    if (window.confirm(`Make "${row.name}" the default warehouse for ${locationName}? Stock not placed in another warehouse is counted here, and new documents will use it. No stock is moved.`)) void send("PATCH", { id: row.id, action: "setDefault" }, `"${row.name}" is now the default warehouse`);
  };
  const remove = (row: WarehouseRow) => {
    void confirmDelete({ title: `Remove warehouse ${row.name}?`, description: "Only warehouses without stock can be removed. This cannot be undone.", details: [{ label: "Type", value: row.isDefault ? "Warehouse · default" : "Warehouse" }, { label: "Name", value: row.name }, { label: "Code", value: row.code }, { label: "Inventory", value: locationName }, { label: "Items", value: `${row.itemCount}` }, { label: "Quantity", value: `${row.quantity}` }], confirmLabel: "Remove warehouse" }).then((confirmed) => { if (confirmed) void send("DELETE", { id: row.id }, "Warehouse removed"); });
  };

  return <div className="mt-4 border-t pt-3" aria-label={`Warehouses in ${locationName}`}>{confirmDeleteDialog}
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Warehouse className="size-3.5" />Warehouses{rows ? ` · ${rows.length}` : ""}</p>
      {!adding && canActivateMore && <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => setAdding(true)}><Plus className="size-3.5" />Add warehouse</Button>}
    </div>
    {rows === null ? <p className="mt-2 text-xs text-muted-foreground">Loading warehouses…</p> : <ul className="mt-2 space-y-1.5">{rows.map((row) => <li key={row.id} className={`rounded-lg border px-2.5 py-2 text-sm ${row.active ? "" : "opacity-60"}`}>
      {editing?.id === row.id ? <form onSubmit={saveEdit} className="flex flex-wrap items-center gap-1.5">
        <Input aria-label="Warehouse name" value={editing.name} maxLength={80} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="h-8 min-w-0 flex-1 basis-32" autoFocus />
        <Input aria-label="Warehouse code" value={editing.code} maxLength={20} onChange={(event) => setEditing({ ...editing, code: event.target.value.toUpperCase() })} className="h-8 w-24 font-mono uppercase" />
        <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy} aria-label="Save warehouse"><Check className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setEditing(null)} aria-label="Cancel editing"><X className="size-4" /></Button>
      </form> : <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">{row.name}<span className="font-mono text-xs text-muted-foreground">{row.code}</span>{row.isDefault && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Default</Badge>}{!row.active && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Inactive</Badge>}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{row.itemCount} {row.itemCount === 1 ? "item" : "items"} · {quantity(row.quantity)} units</p>
        </div>
        <div className="flex shrink-0 items-center [&_button]:size-8">
          <Button type="button" size="icon" variant="ghost" disabled={busy} title="Rename" aria-label={`Rename ${row.name}`} onClick={() => setEditing({ id: row.id, name: row.name, code: row.code })}><Pencil className="size-3.5" /></Button>
          {!row.isDefault && row.active && <Button type="button" size="icon" variant="ghost" disabled={busy} title="Make default" aria-label={`Make ${row.name} the default warehouse`} onClick={() => makeDefault(row)}><Star className="size-3.5" /></Button>}
          {!row.isDefault && (row.active || canActivateMore) && <Button type="button" size="sm" variant="ghost" className="!w-auto px-2 text-xs" disabled={busy} onClick={() => void send("PATCH", { id: row.id, action: row.active ? "deactivate" : "activate" }, row.active ? "Warehouse deactivated" : "Warehouse activated")}>{row.active ? "Deactivate" : "Activate"}</Button>}
          {!row.isDefault && <Button type="button" size="icon" variant="ghost" className="text-rose-600" disabled={busy} title="Remove" aria-label={`Remove ${row.name}`} onClick={() => remove(row)}><Trash2 className="size-3.5" /></Button>}
        </div>
      </div>}
    </li>)}</ul>}
    {adding && <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
      <Input aria-label="New warehouse name" placeholder="Warehouse name, e.g. Jebel Ali store" value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-8 min-w-0 flex-1 basis-40" autoFocus required />
      <Input aria-label="New warehouse code" placeholder="Code" value={draft.code} maxLength={20} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} className="h-8 w-24 font-mono uppercase" required />
      <Button type="submit" size="sm" className="h-8" disabled={busy || !draft.name.trim() || !draft.code.trim()}>Add</Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setDraft({ name: "", code: "" }); }}>Cancel</Button>
    </form>}
    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Stock not placed in another warehouse is counted in the default warehouse.</p>
  </div>;
}
