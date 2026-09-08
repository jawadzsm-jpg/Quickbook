"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type InventoryLocation = { id: number; companyId: number; name: string; code: string };
type CompanyWorkspace = { id: number; name: string; locations: InventoryLocation[] };
type CatalogItem = { id: number; companyId: number; locationId: number; itemNumber: string | null; sku: string; name: string; quantity: number };
type TransferRecord = { id: number; reference: string; transferDate: string; itemNumber: string | null; sku: string; itemName: string; quantity: number; salesman: string; sourceCompany: string; sourceLocation: string; destinationCompany: string; destinationLocation: string };
type Salesman = { id: number; name: string; companyId: number };
type TransferLine = { key: string; sourceLocationId: string; destinationLocationId: string; itemId: string; quantity: string };

const today = () => new Date().toISOString().slice(0, 10);

export function MultiLineTransferCenter({ companies, activeLocationId, onTransferred }: { companies: CompanyWorkspace[]; activeLocationId: number; onTransferred: () => Promise<void> }) {
  const locations = companies.flatMap((company) => company.locations.map((location) => ({ ...location, companyName: company.name })));
  const destination = locations.find((location) => location.id !== activeLocationId);
  const blankLine = (): TransferLine => ({ key: crypto.randomUUID(), sourceLocationId: String(activeLocationId), destinationLocationId: String(destination?.id ?? ""), itemId: "", quantity: "1" });
  const [lines, setLines] = useState<TransferLine[]>([blankLine()]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [transferDate, setTransferDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [salesman, setSalesman] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [catalogResponse, historyResponse] = await Promise.all([fetch("/api/transfers?catalog=1"), fetch("/api/transfers")]);
      const [catalogData, historyData] = await Promise.all([catalogResponse.json(), historyResponse.json()]);
      if (!catalogResponse.ok) throw new Error(catalogData.error || "Could not load products");
      if (!historyResponse.ok) throw new Error(historyData.error || "Could not load transfers");
      setCatalog(catalogData.records);
      setSalesmen(catalogData.salesmen ?? []);
      setHistory(historyData.records);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load transfer data"); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  const updateLine = (key: string, change: Partial<TransferLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  const addLine = () => setLines((current) => [...current, blankLine()]);
  const removeLine = (key: string) => setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  const locationLabel = (location: typeof locations[number]) => `${location.companyName} — ${location.name}`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferDate, reference, salesman, notes, lines: lines.map((line) => ({ itemId: Number(line.itemId), sourceLocationId: Number(line.sourceLocationId), destinationLocationId: Number(line.destinationLocationId), quantity: Number(line.quantity) })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save transfer");
      toast.success(`${data.transfer.lineCount} lines transferred · ${data.transfer.reference}`);
      setLines([blankLine()]); setReference(""); setSalesman(""); setNotes("");
      await Promise.all([loadData(), onTransferred()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save transfer"); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <form onSubmit={submit} className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-t-cyan-500 p-5"><div><h2 className="font-bold">Transfer Inventory</h2><p className="text-sm text-slate-500">Add multiple products and move them together in one transfer.</p></div><Button type="button" onClick={addLine} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Plus className="size-4" />Add line</Button></div>
      <div className="grid gap-4 border-y bg-slate-50/60 p-5 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Transfer date</Label><Input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required /></div><div className="space-y-2"><Label>Reference</Label><Input value={reference} onChange={(event) => setReference(event.target.value.toUpperCase())} maxLength={40} placeholder="Automatic if blank" /></div><div className="space-y-2"><Label>Salesman</Label><Select value={salesman || undefined} onValueChange={setSalesman}><SelectTrigger><SelectValue placeholder="Select salesman" /></SelectTrigger><SelectContent>{salesmen.length ? salesmen.map((person) => <SelectItem key={person.id} value={person.name}>{person.name}</SelectItem>) : <SelectItem value="none" disabled>No salesmen available</SelectItem>}</SelectContent></Select></div><div className="space-y-2"><Label>Notes</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional transfer note" /></div></div>
      <div className="overflow-x-auto p-5"><Table className="min-w-[1050px]"><TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead className="min-w-[300px]">Product</TableHead><TableHead className="min-w-[220px]">From</TableHead><TableHead className="min-w-[220px]">To</TableHead><TableHead className="w-36">Quantity</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{lines.map((line, index) => {
        const availableItems = catalog.filter((item) => String(item.locationId) === line.sourceLocationId && item.quantity > 0);
        const selectedItem = catalog.find((item) => String(item.id) === line.itemId);
        return <TableRow key={line.key}><TableCell className="font-semibold">{index + 1}</TableCell><TableCell><Select value={line.itemId} onValueChange={(value) => updateLine(line.key, { itemId: value })}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{availableItems.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.sku} · {item.name} · Qty {item.quantity}</SelectItem>)}</SelectContent></Select>{line.sourceLocationId && availableItems.length === 0 && <p className="mt-1 text-xs text-amber-700">No available products.</p>}</TableCell><TableCell><Select value={line.sourceLocationId} onValueChange={(value) => { const replacement = locations.find((location) => String(location.id) !== value); updateLine(line.key, { sourceLocationId: value, itemId: "", destinationLocationId: line.destinationLocationId === value ? String(replacement?.id ?? "") : line.destinationLocationId }); }}><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{locationLabel(location)}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Select value={line.destinationLocationId} onValueChange={(value) => updateLine(line.key, { destinationLocationId: value })}><SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger><SelectContent>{locations.filter((location) => String(location.id) !== line.sourceLocationId).map((location) => <SelectItem key={location.id} value={String(location.id)}>{locationLabel(location)}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input type="number" min="0.01" max={selectedItem?.quantity} step="0.01" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /><p className="mt-1 text-xs text-slate-500">Available: {selectedItem?.quantity ?? "—"}</p></TableCell><TableCell><Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => removeLine(line.key)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove line ${index + 1}`}><Trash2 className="size-4" /></Button></TableCell></TableRow>;
      })}</TableBody></Table></div>
      <div className="flex justify-end border-t bg-slate-50 p-4"><Button disabled={saving || lines.some((line) => !line.itemId || !line.sourceLocationId || !line.destinationLocationId)} className="bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"><ArrowRightLeft className="size-4" />{saving ? "Transferring…" : `Transfer ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}</Button></div>
    </form>
    <section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">Transfer history</h2><p className="text-sm text-slate-500">Each line is recorded under its shared transfer reference.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Salesman</TableHead><TableHead>Item</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow></TableHeader><TableBody>{history.length ? history.map((transfer) => <TableRow key={transfer.id}><TableCell>{transfer.transferDate}</TableCell><TableCell className="font-mono text-xs">{transfer.reference}</TableCell><TableCell>{transfer.salesman || "—"}</TableCell><TableCell><p className="font-medium">{transfer.itemName}</p><p className="text-xs text-slate-500">{transfer.sku}{transfer.itemNumber ? ` · ${transfer.itemNumber}` : ""}</p></TableCell><TableCell><p>{transfer.sourceCompany}</p><p className="text-xs text-slate-500">{transfer.sourceLocation}</p></TableCell><TableCell><p>{transfer.destinationCompany}</p><p className="text-xs text-slate-500">{transfer.destinationLocation}</p></TableCell><TableCell className="text-right font-semibold">{transfer.quantity}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">No stock transfers yet.</TableCell></TableRow>}</TableBody></Table></div></section>
  </div>;
}
