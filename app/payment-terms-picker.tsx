"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PaymentTermsPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [terms, setTerms] = useState(["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Advance payment", "50% advance · 50% on delivery"]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/payment-terms", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load payment terms.");
    setTerms(data.terms);
  }, []);
  const filtered = useMemo(() => terms.filter((term) => term.toLowerCase().includes(search.trim().toLowerCase())), [search, terms]);

  async function change(method: "POST" | "PATCH" | "DELETE", payload: Record<string, string>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/payment-terms", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update payment terms.");
      await load();
      toast.success(success);
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update payment terms."); return false; }
    finally { setBusy(false); }
  }

  return <div className="space-y-2">
    <Label htmlFor="document-payment-terms">Payment Terms</Label>
    <Popover modal open={open} onOpenChange={(next) => { setOpen(next); if (next) { setSearch(""); void load().catch((error) => toast.error(error instanceof Error ? error.message : "Could not load payment terms.")); } }}>
      <div className="flex min-w-0">
        <Input id="document-payment-terms" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Select or enter payment terms" className="rounded-r-none" maxLength={200} />
        <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="Manage payment terms" title="Manage payment terms" className="shrink-0 rounded-l-none border-l-0"><ChevronDown className="size-4" /></Button></PopoverTrigger>
      </div>
      <PopoverContent data-attachments-excluded="true" align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(36rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto p-3">
        <div><p className="text-sm font-bold">Payment Terms choices</p><p className="text-xs text-muted-foreground">Select, add, rename or remove a choice.</p></div>
        <Input aria-label="Search payment terms choices" placeholder="Search choices…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
        <div className="max-h-64 min-h-0 space-y-1 overflow-y-auto overscroll-contain" role="region" aria-label="Payment terms choices">
          {filtered.length ? filtered.map((term) => editing === term ? <div key={term} className="flex gap-1"><Input autoFocus value={editedValue} maxLength={200} onChange={(event) => setEditedValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void change("PATCH", { oldValue: term, newValue: editedValue.trim() }, "Payment terms renamed").then((saved) => { if (!saved) return; if (value === term) onChange(editedValue.trim()); setEditing(null); }); } }} className="h-8" /><Button type="button" size="icon" variant="ghost" disabled={busy || !editedValue.trim()} onClick={() => void change("PATCH", { oldValue: term, newValue: editedValue.trim() }, "Payment terms renamed").then((saved) => { if (!saved) return; if (value === term) onChange(editedValue.trim()); setEditing(null); })} aria-label="Save renamed payment terms" className="size-8 text-emerald-600"><Check className="size-4" /></Button></div> : <div key={term} className="group flex items-center gap-1 rounded-md hover:bg-muted"><button type="button" onClick={() => { onChange(term); setOpen(false); }} className="min-w-0 flex-1 whitespace-normal break-words px-2 py-2 text-left text-sm">{term}</button><Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => { setEditing(term); setEditedValue(term); }} aria-label={`Rename ${term}`} className="size-8 shrink-0 text-muted-foreground hover:text-sky-600"><Pencil className="size-3.5" /></Button><Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => void change("DELETE", { value: term }, "Payment terms removed").then((saved) => { if (saved && value === term) onChange(""); })} aria-label={`Remove ${term}`} className="size-8 shrink-0 text-muted-foreground hover:text-rose-600"><Trash2 className="size-3.5" /></Button></div>) : <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">No matching choices.</p>}
        </div>
        <div className="flex gap-2 border-t pt-3"><Input value={newValue} maxLength={200} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const next = newValue.trim(); if (next) void change("POST", { value: next }, "Payment terms added").then((saved) => { if (!saved) return; onChange(next); setNewValue(""); }); } }} placeholder="Add new payment terms" className="h-9" /><Button type="button" size="sm" disabled={busy || !newValue.trim()} onClick={() => { const next = newValue.trim(); void change("POST", { value: next }, "Payment terms added").then((saved) => { if (!saved) return; onChange(next); setNewValue(""); }); }}><Plus className="size-4" />Add</Button></div>
      </PopoverContent>
    </Popover>
  </div>;
}
