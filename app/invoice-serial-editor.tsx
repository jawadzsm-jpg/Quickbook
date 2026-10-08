"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";

// Appends serial numbers without touching amounts. Used for bills and item receipts after their creation day.
export function InvoiceSerialEditor({ companyId, invoiceId, revision, lines, onSaved, mode = "invoice-serials", label = "invoice" }: { companyId: number; invoiceId: number; revision: string; lines: { id: number; itemId?: number | null; description: string; serialNumber: string }[]; onSaved: () => void; mode?: "invoice-serials" | "purchase-serials"; label?: string }) {
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [additions, setAdditions] = useState<Record<number,string>>({});
  const lock = useSkuLock(open ? { resource: "records", kind: "transactions", companyId, id: invoiceId, lines: lines.map(line => ({ itemId: line.itemId })) } : null);
  async function save() {
    if (!lock.ready) return;
    setSaving(true);
    try {
      const lineDetails = lines.filter(line => additions[line.id]?.trim()).map(line => ({ id: line.id, serialNumber: [line.serialNumber, additions[line.id].trim()].filter(Boolean).join("\n") }));
      const response = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json", ...lock.headers }, body: JSON.stringify({ kind: "transactions", editMode: mode, companyId, id: invoiceId, revision, lineDetails }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      toast.success("Serial numbers added."); setOpen(false); setAdditions({}); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save serial numbers."); }
    finally { setSaving(false); }
  }
  return <><Button onClick={() => setOpen(true)}>Add serial numbers</Button><Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogTitle>Add {label} serial numbers</DialogTitle><DialogDescription>Existing serial numbers, items and amounts are preserved.</DialogDescription><SkuLockNotice message={lock.message} />
    {lines.map(line => <label key={line.id} className="block min-w-0 space-y-2 rounded-lg border p-3 text-sm"><span className="block break-words font-semibold">{line.description}</span>{line.serialNumber && <span className="block whitespace-pre-wrap break-words text-muted-foreground">{line.serialNumber}</span>}<Textarea disabled={saving} placeholder="Additional serial numbers" value={additions[line.id] || ""} onChange={e => setAdditions({ ...additions, [line.id]: e.target.value })} /></label>)}
    <Button disabled={saving || !lock.ready || !Object.values(additions).some(value => value.trim())} onClick={() => void save()}>{saving ? "Saving…" : "Save serial numbers"}</Button>
  </DialogContent></Dialog></>;
}
