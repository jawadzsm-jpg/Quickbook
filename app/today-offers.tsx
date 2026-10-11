"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Tag, TimerOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemSearchSelect, itemSearchDetail, itemSearchFields } from "./item-search-select";
import { OFFER_MAX_DAYS, offerState, offerTime } from "@/lib/item-offers";

export type TodayOffer = {
  id: number; itemId: number; offerPrice: number; startsAt: string; endsAt: string; note: string; createdByName: string;
  itemName: string; sku: string; itemNumber: string | null; salesPrice: number; quantity: number;
  companyId: number; companyName: string; currency: string; locationId: number; locationName: string;
};
type OfferItem = { id: number; name: string; sku: string; itemNumber: string | null; salesPrice: number; companyId: number; companyName: string; currency: string; locationName: string } & Record<string, unknown>;

const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString("en-AE", { maximumFractionDigits: 2 })}`; }
};
const when = (value: string) => new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(offerTime(value));
// <input type="datetime-local"> works in the browser's local time.
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const endOfToday = () => { const date = new Date(); date.setHours(23, 59, 0, 0); return date; };
function timeLeft(endsAt: string, now: number) {
  const minutes = Math.max(0, Math.round((offerTime(endsAt) - now) / 60_000));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min left` : `${Math.floor(hours / 24)} days left`;
}

/** Running offers count toward the tab badge; scheduled ones are listed with their start time. */
export const runningOffers = (offers: TodayOffer[], now = Date.now()) => offers.filter((offer) => offerState(offer, now) === "active");

export function TodayOffersPanel({ offers, items, canManage, loading, onChanged, onOpenItem }: {
  offers: TodayOffer[]; items: OfferItem[]; canManage: boolean; loading: boolean; onChanged: () => void; onOpenItem: (offer: TodayOffer) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [endingId, setEndingId] = useState<number | null>(null);
  // Refresh "time left" and drop finished offers while the overview stays open.
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const visible = offers.filter((offer) => offerState(offer, now) !== "ended");

  async function endOffer(offer: TodayOffer) {
    setEndingId(offer.id);
    try {
      const response = await fetch("/api/item-offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: offer.companyId, id: offer.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not end the offer.");
      toast.success(`Offer on ${offer.sku} ended.`);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not end the offer."); }
    finally { setEndingId(null); }
  }

  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
      <p className="text-sm text-muted-foreground">Special selling prices with a start and end time. Running offers are counted on the tab.</p>
      {canManage ? <Button type="button" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />Add offer</Button> : null}
    </div>
    <div className="overflow-x-auto">
      <Table className="min-w-[900px]">
        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Company · inventory</TableHead><TableHead>Offer price</TableHead><TableHead>Offer time</TableHead><TableHead>Note</TableHead><TableHead className="w-44 text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Loading offers…</TableCell></TableRow> : visible.length ? visible.map((offer) => {
            const state = offerState(offer, now);
            const saving = offer.salesPrice > offer.offerPrice ? Math.round((1 - offer.offerPrice / offer.salesPrice) * 100) : 0;
            return <TableRow key={offer.id} className="align-top">
              <TableCell><p className="font-semibold text-primary">{offer.itemName}</p><p className="mt-1 text-xs text-muted-foreground">SKU {offer.sku}{offer.itemNumber ? ` · #${offer.itemNumber}` : ""} · {Number(offer.quantity).toLocaleString("en-AE")} in stock</p></TableCell>
              <TableCell><p className="font-medium">{offer.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{offer.locationName}</p></TableCell>
              <TableCell><p className="font-semibold"><span className="text-muted-foreground line-through">{money(offer.salesPrice, offer.currency)}</span><span className="mx-2">→</span><span className="text-violet-600 dark:text-violet-400">{money(offer.offerPrice, offer.currency)}</span></p>{saving > 0 ? <p className="mt-1 text-xs font-semibold text-emerald-600">{saving}% off</p> : null}</TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge className={state === "active" ? "bg-violet-600 text-white" : "bg-muted text-foreground"}>{state === "active" ? "Running" : "Scheduled"}</Badge>
                <p className="mt-1.5 text-xs"><span className="text-muted-foreground">Start offer:</span> {when(offer.startsAt)}</p>
                <p className="text-xs"><span className="text-muted-foreground">End offer:</span> {when(offer.endsAt)}</p>
                {state === "active" ? <p className="mt-1 text-xs font-semibold text-amber-600">{timeLeft(offer.endsAt, now)}</p> : null}
              </TableCell>
              <TableCell><p className="text-sm">{offer.note || "—"}</p>{offer.createdByName ? <p className="mt-1 text-xs text-muted-foreground">By {offer.createdByName}</p> : null}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => onOpenItem(offer)}><Eye className="size-4" />Item</Button>{canManage ? <Button type="button" size="sm" variant="outline" disabled={endingId === offer.id} onClick={() => void endOffer(offer)}><TimerOff className="size-4" />{state === "active" ? "End" : "Cancel"}</Button> : null}</div></TableCell>
            </TableRow>;
          }) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No offers running or scheduled.{canManage ? " Use Add offer to create one." : ""}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    {adding ? <AddOfferDialog items={items} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} /> : null}
  </>;
}

function AddOfferDialog({ items, onClose, onSaved }: { items: OfferItem[]; onClose: () => void; onSaved: () => void }) {
  const [itemId, setItemId] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [startsAt, setStartsAt] = useState(() => localInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => localInput(endOfToday()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = useMemo(() => items.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}`, detail: [item.companyName, item.locationName, itemSearchDetail(item)].filter(Boolean).join(" · "), search: itemSearchFields(item) })), [items]);
  const item = items.find((entry) => String(entry.id) === itemId);

  async function save() {
    setError("");
    if (!item) return setError("Select an item.");
    setSaving(true);
    try {
      const response = await fetch("/api/item-offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: item.companyId, itemId: item.id, offerPrice: Number(offerPrice), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the offer.");
      toast.success(`Offer saved for ${item.sku}.`);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the offer."); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="size-5 text-violet-500" />Add today offer</DialogTitle><DialogDescription>Set a special selling price with a start and end time. A new offer replaces any current offer on the same item.</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">Item<ItemSearchSelect value={itemId} onValueChange={(value) => { setItemId(value); const picked = items.find((entry) => String(entry.id) === value); if (picked && !offerPrice) setOfferPrice(String(picked.salesPrice || "")); }} options={options} ariaLabel="Offer item" /></label>
        <label className="grid gap-2 text-sm font-medium">Offer price{item ? <span className="text-xs font-normal text-muted-foreground">Normal selling price {money(Number(item.salesPrice), item.currency)}</span> : null}<Input type="number" inputMode="decimal" min="0.01" step="0.01" value={offerPrice} onChange={(event) => setOfferPrice(event.target.value)} placeholder="0.00" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">Start offer<Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-medium">End offer<Input type="datetime-local" value={endsAt} min={startsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        </div>
        <label className="grid gap-2 text-sm font-medium">Note (optional)<Input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="e.g. While stock lasts" /></label>
        <p className="text-xs text-muted-foreground">Offers can run for up to {OFFER_MAX_DAYS} days. The item&apos;s saved selling price does not change.</p>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p> : null}
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save offer"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
