"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
type ReturnLine = { itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatCode: string; vatRate: string };
export function InvoiceStockReturn({ items, disabled, onAdd }: { items: { id: number; sku: string; description: string; status: string; itemType: string }[]; disabled: boolean; onAdd: (line: ReturnLine) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const eligible = items.filter(item => item.status !== "inactive" && item.itemType === "stock-part");
  const selected = eligible.find(item => String(item.id) === itemId);
  const valid = selected && Number.isFinite(Number(quantity)) && Number(quantity) > 0;
  return <><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3"><div className="min-w-0"><p className="text-sm font-semibold">Inventory-only lines</p><p className="text-xs text-muted-foreground">Quantity -1 returns one unit to stock at zero selling price. Returns and zero-priced lines appear only on the inventory copy.</p></div><Button type="button" variant="outline" disabled={disabled} onClick={() => { setItemId(""); setQuantity("1"); setQuery(""); setOpen(true); }}><Plus className="size-4" />Add stock return</Button></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>Return an item to inventory</DialogTitle><DialogDescription>The invoice records a negative quantity. Customer amount and VAT stay unchanged. Stock moves when you save the invoice.</DialogDescription></DialogHeader><label className="grid gap-2 text-sm">Find stock item<Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU or description" /></label><label className="grid min-w-0 gap-2 text-sm">Item<select className="h-10 w-full min-w-0 rounded-md border bg-background px-2" value={itemId} onChange={event => setItemId(event.target.value)}><option value="">Select stock item</option>{eligible.filter(item => String(item.id) === itemId || `${item.sku} ${item.description}`.toLowerCase().includes(query.toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.sku} · {item.description}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm">Units to add back<Input type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label className="grid gap-2 text-sm">Customer price<Input readOnly value="0.00" /></label></div><p className="text-sm text-muted-foreground">Invoice quantity: {valid ? -Number(quantity) : "—"} · Inventory Copy only</p><Button type="button" disabled={!valid} onClick={() => { if (!selected || !valid) return; onAdd({ itemId, description: selected.description, quantity: String(-Number(quantity)), unitPrice: "0", unitCost: "0", vatCode: "ZERO", vatRate: "0" }); setOpen(false); }}>Add inventory-only line</Button></DialogContent></Dialog>
  </>;
}
