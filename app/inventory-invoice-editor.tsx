"use client";
import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { ItemSearchSelect, itemSearchDetail, itemSearchFields } from "./item-search-select";

type InvoiceLine = { id: number; itemId: number | null; description: string; serialNumber: string; comments: string; quantity: number; isFreightCharge: boolean };
type Item = { id: number; sku: string; name: string; quantity: number; itemType: string; status: string; itemNumber?: string | null; partNumber?: string; upcNumber?: string; description?: string };
type LineDraft = { itemId: number | null; addSerials: string; serials: string; comments: string };
type NewLine = { key: number; itemId: number | null; quantity: string; serialNumber: string; comments: string; isReturn: boolean };

const sellable = new Set(["service", "stock-part", "non-stock-part", "other-charge"]);
const itemLabel = (item: Item, stock = item.quantity) => `${item.sku} · ${item.name}${item.itemType === "stock-part" ? ` (stock ${stock})` : ""}`;

function ItemSelect({ items, value, onChange, label, disabled, stockLeft }: { items: Item[]; value: number | null; onChange: (id: number | null) => void; label: string; disabled?: boolean; stockLeft?: (item: Item) => number }) {
  return <ItemSearchSelect ariaLabel={label} placeholder="Select an item…" disabled={disabled} value={value ? String(value) : ""} onValueChange={(next) => onChange(next ? Number(next) : null)} options={items.map((item) => ({ value: String(item.id), label: itemLabel(item, stockLeft ? stockLeft(item) : item.quantity), detail: itemSearchDetail(item), search: itemSearchFields(item) }))} />;
}

// Inventory users correct which product was sold, add free lines (accessories, cables) and record serial numbers and
// comments. Quantities, prices and the invoice total are fixed; the server re-checks every rule.
export function InventoryInvoiceEditor({ companyId, locationId, invoiceId, revision, comments, lines, onSaved, defaultOpen = false, onDefaultOpened }: { companyId: number; locationId: number; invoiceId: number; revision: string; comments: string; lines: InvoiceLine[]; onSaved: () => void; defaultOpen?: boolean; onDefaultOpened?: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  // Opened from a list row's edit icon: open once, then let the parent forget the request.
  useEffect(() => { if (defaultOpen) onDefaultOpened?.(); }, [defaultOpen, onDefaultOpened]);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [invoiceComments, setInvoiceComments] = useState(comments);
  const editable = lines.filter((line) => !line.isFreightCharge);

  useEffect(() => {
    if (!open || !locationId) return;
    let active = true;
    fetch(`/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load items");
      if (active) setItems((data.records as Item[]).filter((item) => item.status !== "inactive" && sellable.has(item.itemType)).sort((a, b) => a.sku.localeCompare(b.sku)));
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load items"); });
    return () => { active = false; };
  }, [open, companyId, locationId]);

  const lockLines = useMemo(() => [...editable.map((line) => ({ itemId: drafts[line.id]?.itemId ?? line.itemId })), ...editable.map((line) => ({ itemId: line.itemId })), ...newLines.map((line) => ({ itemId: line.itemId }))].filter((line) => line.itemId), [editable, drafts, newLines]);
  const lock = useSkuLock(open ? { resource: "records", kind: "transactions", companyId, id: invoiceId, lines: lockLines } : null);

  function draft(line: InvoiceLine) { return drafts[line.id] ?? { itemId: line.itemId, addSerials: "", serials: "", comments: line.comments }; }
  function setDraft(line: InvoiceLine, patch: Partial<LineDraft>) { setDrafts((current) => ({ ...current, [line.id]: { ...draft(line), ...patch } })); }
  function reset() { setDrafts({}); setNewLines([]); setInvoiceComments(comments); }

  // Stock already taken by other changes in this editor (item changes and free lines; returns give stock back).
  const takenElsewhere = (itemId: number, except: string) => editable.reduce((sum, line) => {
    const entry = drafts[line.id];
    return `line-${line.id}` !== except && entry && entry.itemId === itemId && entry.itemId !== line.itemId ? sum + line.quantity : sum;
  }, 0) + newLines.reduce((sum, line) => `new-${line.key}` !== except && line.itemId === itemId ? sum + (line.isReturn ? -1 : 1) * (Number(line.quantity) || 0) : sum, 0);
  const stockLeftFor = (except: string) => (item: Item) => item.quantity - takenElsewhere(item.id, except);

  const lineDetails = editable.flatMap((line) => {
    const entry = drafts[line.id];
    if (!entry) return [];
    const swapped = entry.itemId !== line.itemId;
    const detail: Record<string, unknown> = { id: line.id };
    if (swapped) { detail.itemId = entry.itemId; detail.fromItemId = line.itemId; detail.serialNumber = entry.serials.trim(); }
    else if (entry.addSerials.trim()) detail.serialNumber = [line.serialNumber, entry.addSerials.trim()].filter(Boolean).join("\n");
    if (entry.comments !== line.comments) detail.comments = entry.comments;
    return Object.keys(detail).length > 1 ? [detail] : [];
  });
  const readyNewLines = newLines.filter((line) => line.itemId && Number(line.quantity) > 0);
  const incompleteNewLine = newLines.some((line) => !line.itemId || !(Number(line.quantity) > 0));
  const changed = lineDetails.length > 0 || newLines.length > 0 || invoiceComments !== comments;

  async function save() {
    if (!lock.ready || incompleteNewLine) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { kind: "transactions", editMode: "inventory-invoice", companyId, id: invoiceId, revision };
      if (lineDetails.length) payload.lineDetails = lineDetails;
      // Stock returns are sent as negative quantities; the server returns the item to stock at zero price.
      if (readyNewLines.length) payload.appendLines = readyNewLines.map((line) => ({ itemId: line.itemId, quantity: line.isReturn ? -Number(line.quantity) : Number(line.quantity), serialNumber: line.serialNumber.trim(), comments: line.comments, unitPrice: 0 }));
      if (invoiceComments !== comments) payload.comments = invoiceComments;
      const response = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json", ...lock.headers }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the invoice");
      toast.success("Invoice items updated");
      setOpen(false); reset(); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the invoice"); }
    finally { setSaving(false); }
  }

  return <>
    <Button onClick={() => setOpen(true)}><PackagePlus className="size-4" />Items &amp; serial numbers</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next) reset(); } }}>
      <DialogContent data-unsaved-tracking data-unsaved={changed ? "" : undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Invoice items &amp; serial numbers</DialogTitle><DialogDescription>Change the product on a line, add free (zero-price) lines, and record serial numbers and comments. Quantities, prices and the invoice total stay the same; stock updates automatically.</DialogDescription></DialogHeader>
        <SkuLockNotice message={lock.message} />
        <div className="space-y-3">
          {editable.map((line) => {
            const entry = draft(line);
            const swapped = entry.itemId !== line.itemId;
            return <article key={line.id} className={`min-w-0 space-y-3 rounded-xl border p-3 text-sm ${swapped ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 whitespace-pre-wrap break-words font-semibold">{line.description}</p><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">Qty {line.quantity}</span></div>
              {line.itemId && line.quantity > 0 ? <div className="space-y-1"><Label className="text-xs text-muted-foreground">Item</Label><ItemSelect stockLeft={stockLeftFor(`line-${line.id}`)} label={`Item for ${line.description}`} items={items.some((item) => item.id === line.itemId) ? items : [{ id: line.itemId, sku: "Current", name: line.description.split("\n")[0], quantity: 0, itemType: "", status: "active" }, ...items]} value={entry.itemId} disabled={saving} onChange={(itemId) => setDraft(line, { itemId: itemId ?? line.itemId })} />{swapped && <p className="text-xs text-amber-800 dark:text-amber-300">Item will change. The original item returns to stock; the new item is taken from stock at the same quantity and price.</p>}</div> : null}
              {swapped ? <div className="space-y-1"><Label className="text-xs text-muted-foreground">Serial numbers for the new item</Label><Textarea disabled={saving} value={entry.serials} onChange={(event) => setDraft(line, { serials: event.target.value })} placeholder="One per line" /></div>
                : <div className="space-y-1"><Label className="text-xs text-muted-foreground">Serial numbers</Label>{line.serialNumber && <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">{line.serialNumber}</p>}<Textarea disabled={saving} value={entry.addSerials} onChange={(event) => setDraft(line, { addSerials: event.target.value })} placeholder={line.serialNumber ? "Add more serial numbers" : "One per line"} /></div>}
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Line comments</Label><Input disabled={saving} value={entry.comments} onChange={(event) => setDraft(line, { comments: event.target.value })} maxLength={2000} /></div>
            </article>;
          })}
        </div>
        <section className="space-y-3 rounded-xl border border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Add free lines or stock returns</h3><p className="text-xs text-muted-foreground">Free lines are zero-price items such as accessories. A stock return brings an item back into stock at zero price. Ask an accountant to add charged items.</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setNewLines((current) => [...current, { key: Date.now(), itemId: null, quantity: "1", serialNumber: "", comments: "", isReturn: false }])}><Plus className="size-4" />Add line</Button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setNewLines((current) => [...current, { key: Date.now(), itemId: null, quantity: "1", serialNumber: "", comments: "", isReturn: true }])}><Plus className="size-4" />Add stock return</Button></div></div>
          {newLines.map((line) => <div key={line.key} className={`grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_100px_auto] ${line.isReturn ? "border-sky-500/40 bg-sky-500/5" : ""}`}>
            {line.isReturn && <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 sm:col-span-3 dark:text-sky-300"><Undo2 className="size-3.5" />Stock return · the quantity comes back into stock</p>}
            <ItemSelect stockLeft={stockLeftFor(`new-${line.key}`)} label={line.isReturn ? "Stock return item" : "New line item"} items={line.isReturn ? items.filter((item) => item.itemType === "stock-part") : items} value={line.itemId} disabled={saving} onChange={(itemId) => setNewLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, itemId } : entry))} />
            <Input aria-label={line.isReturn ? "Quantity returned" : "New line quantity"} type="number" min="1" step="1" disabled={saving} value={line.quantity} onChange={(event) => setNewLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, quantity: event.target.value } : entry))} />
            <Button type="button" size="icon" variant="ghost" aria-label="Remove new line" disabled={saving} onClick={() => setNewLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 className="size-4" /></Button>
            <Textarea className="sm:col-span-3" aria-label="New line serial numbers" disabled={saving} value={line.serialNumber} onChange={(event) => setNewLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, serialNumber: event.target.value } : entry))} placeholder="Serial numbers (optional)" />
            <Input className="sm:col-span-3" aria-label="New line comments" disabled={saving} value={line.comments} onChange={(event) => setNewLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, comments: event.target.value } : entry))} placeholder="Comments (optional)" maxLength={2000} />
          </div>)}
        </section>
        <div className="space-y-1"><Label htmlFor="inventory-invoice-comments">Invoice comments</Label><Textarea id="inventory-invoice-comments" disabled={saving} value={invoiceComments} onChange={(event) => setInvoiceComments(event.target.value)} maxLength={5000} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => { setOpen(false); reset(); }}>Cancel</Button><Button type="button" data-save-changes disabled={saving || !lock.ready || !changed || incompleteNewLine} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
