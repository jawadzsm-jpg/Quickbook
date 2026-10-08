"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type StockHold = { id: number; itemId: number; companyId: number; quantity: number; salesRep: string; note: string; expiresAt: string; createdByName: string; createdAt: string };
type Presence = { id: number; companyId: number; companyName: string; locationName: string; locationCode: string; quantity: number };
type HoldTarget = { name: string; sku: string; inventories: Presence[] };

const durations = [[4, "4 hours"], [24, "1 day"], [48, "2 days"]] as const;
const parseTime = (value: string) => new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
export function holdTimeLeft(expiresAt: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((parseTime(expiresAt).getTime() - now) / 60000));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min left` : `${Math.floor(hours / 24)} d ${hours % 24} h left`;
}
const until = (value: string) => parseTime(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Total held quantity per item id. */
export function heldTotals(holds: StockHold[]) {
  const totals = new Map<number, number>();
  for (const hold of holds) totals.set(hold.itemId, (totals.get(hold.itemId) ?? 0) + Number(hold.quantity));
  return totals;
}

// Put a quantity of one item on hold for a sales rep (administrators and accountants).
export function StockHoldDialog({ target, holds, onClose, onSaved }: { target: HoldTarget | null; holds: StockHold[]; onClose: () => void; onSaved: () => void }) {
  const inStock = useMemo(() => (target?.inventories ?? []).filter((inventory) => Number(inventory.quantity) > 0), [target]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [hours, setHours] = useState<number>(4);
  const [customHours, setCustomHours] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [note, setNote] = useState("");
  const [reps, setReps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const selected = inStock.find((inventory) => inventory.id === itemId) ?? inStock[0];
  const held = selected ? holds.filter((hold) => hold.itemId === selected.id).reduce((sum, hold) => sum + Number(hold.quantity), 0) : 0;
  const free = selected ? Math.max(0, Number(selected.quantity) - held) : 0;
  const effectiveHours = hours === 0 ? Number(customHours) : hours;

  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(`/api/stock-holds?companyId=${selected.companyId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load sales reps");
      if (active) setReps(data.salesReps ?? []);
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load sales reps"); });
    return () => { active = false; };
  }, [selected]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock-holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: selected.companyId, itemId: selected.id, quantity: Number(quantity), hours: effectiveHours, salesRep, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not put the stock on hold");
      toast.success(`${quantity} on hold for ${salesRep}`);
      onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not put the stock on hold"); }
    finally { setSaving(false); }
  }

  const valid = selected && Number(quantity) > 0 && Number(quantity) <= free && salesRep && Number.isFinite(effectiveHours) && effectiveHours > 0 && effectiveHours <= 168;
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Put stock on hold</DialogTitle><DialogDescription>{target ? `${target.name} · SKU ${target.sku}` : ""}. Held stock can only be sold, returned or transferred by the chosen sales rep until the hold ends.</DialogDescription></DialogHeader>
      {!inStock.length ? <p className="text-sm text-muted-foreground">This product has no stock to hold.</p> : <div className="space-y-4">
        {inStock.length > 1 && <div className="space-y-1.5"><Label>Inventory</Label><div className="flex flex-wrap gap-2">{inStock.map((inventory) => <Button key={inventory.id} type="button" size="sm" variant={selected?.id === inventory.id ? "default" : "outline"} onClick={() => setItemId(inventory.id)}>{inventory.companyName} · {inventory.locationName}</Button>)}</div></div>}
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">In stock <strong>{Number(selected?.quantity ?? 0).toLocaleString()}</strong>{held ? <> · already on hold <strong>{held.toLocaleString()}</strong></> : null} · free to hold <strong>{free.toLocaleString()}</strong></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="hold-quantity">Quantity</Label><Input id="hold-quantity" type="number" min="1" max={free} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="hold-rep">Held for (sales rep)</Label><select id="hold-rep" className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" value={salesRep} onChange={(event) => setSalesRep(event.target.value)}><option value="">Select sales rep…</option>{reps.map((rep) => <option key={rep} value={rep}>{rep}</option>)}</select></div>
        </div>
        <div className="space-y-1.5"><Label>Hold for</Label><div className="flex flex-wrap items-center gap-2">{durations.map(([value, label]) => <Button key={value} type="button" size="sm" variant={hours === value ? "default" : "outline"} onClick={() => setHours(value)}>{label}</Button>)}<Button type="button" size="sm" variant={hours === 0 ? "default" : "outline"} onClick={() => setHours(0)}>Custom</Button>{hours === 0 && <Input aria-label="Custom hours" type="number" min="1" max="168" className="h-8 w-24" placeholder="Hours" value={customHours} onChange={(event) => setCustomHours(event.target.value)} />}</div>{hours === 0 && <p className="text-xs text-muted-foreground">Up to 168 hours (7 days).</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="hold-note">Note</Label><Textarea id="hold-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional, e.g. customer collecting tomorrow" /></div>
      </div>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" disabled={!valid || saving} onClick={() => void save()}><Lock className="size-4" />{saving ? "Saving…" : "Put on hold"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

// Active holds with time left; administrators and accountants can release them early.
export function StockHoldsPanel({ holds, names, canManage, onReleased }: { holds: StockHold[]; names: Map<number, string>; canManage: boolean; onReleased: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const active = holds.filter((hold) => parseTime(hold.expiresAt).getTime() > now);
  if (!active.length) return null;
  async function release(hold: StockHold) {
    if (!window.confirm(`Release ${hold.quantity} held for ${hold.salesRep}? The stock becomes available to everyone.`)) return;
    setBusyId(hold.id);
    try {
      const response = await fetch("/api/stock-holds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: hold.companyId, id: hold.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not release the hold");
      toast.success("Hold released");
      onReleased();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not release the hold"); }
    finally { setBusyId(null); }
  }
  return <section className="rounded-2xl border border-amber-500/30 bg-card shadow-sm" aria-label="Stock on hold">
    <header className="flex items-center gap-2 border-b px-4 py-3"><Lock className="size-4 text-amber-600" /><h2 className="text-sm font-bold">Stock on hold</h2><Badge variant="secondary">{active.length}</Badge><p className="ml-2 hidden text-xs text-muted-foreground sm:block">Reserved for a sales rep; other sales cannot use it until the hold ends.</p></header>
    <ul className="divide-y">{active.map((hold) => <li key={hold.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 font-semibold">{names.get(hold.itemId) ?? `Item ${hold.itemId}`}</span>
      <span><strong>{Number(hold.quantity).toLocaleString()}</strong> for <strong>{hold.salesRep}</strong></span>
      {hold.note ? <span className="text-muted-foreground">“{hold.note}”</span> : null}
      <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300" title={`Until ${until(hold.expiresAt)} (UAE) · by ${hold.createdByName}`}><Clock className="size-3.5" />{holdTimeLeft(hold.expiresAt, now)}</span>
      {canManage && <Button type="button" size="sm" variant="outline" disabled={busyId === hold.id} onClick={() => void release(hold)}><Unlock className="size-4" />Release</Button>}
    </li>)}</ul>
  </section>;
}
