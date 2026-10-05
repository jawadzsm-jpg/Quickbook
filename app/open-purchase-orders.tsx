"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseOrderReceiving } from "./purchase-order-receiving";

type Order = { id: number; number: string; transactionDate: string; currency: string; status: string; memo: string | null; inventory: string };

type OpenPurchaseOrdersProps = { companyId: number; party: string; onSaved: () => void; onComplete: () => void; onSelectBill?: (id: number) => Promise<void> };
export function OpenPurchaseOrders(props: OpenPurchaseOrdersProps) {
  return <PurchaseOrderSelection key={`${props.companyId}-${props.party}`} {...props} />;
}
function PurchaseOrderSelection({ companyId, party, onSaved, onComplete, onSelectBill }: OpenPurchaseOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stage, setStage] = useState<"closed" | "select" | "receive">("closed");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/records?kind=open-purchase-orders&companyId=${companyId}&party=${encodeURIComponent(party)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check open purchase orders.");
        if (controller.signal.aborted) return;
        setSelected([]); setSelectionError("");
        setOrders(data.orders);
        setError("");
        setStage(data.orders.length ? "select" : "closed");
      }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [companyId, party, retry]);

  if (error) return <div role="alert" className="rounded-md border p-3 text-sm">{error} <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>;
  if (!orders.length) return null;
  const current = orders.find((order) => order.id === selected[0]);
  return <>
    <Button type="button" variant="outline" onClick={() => setStage("select")}>{onSelectBill ? "Select purchase order for bill" : "Receive against open purchase orders"} ({orders.length})</Button>
    <Dialog open={stage !== "closed"} onOpenChange={(open) => { if (!open && !selecting) setStage("closed"); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{stage === "receive" ? `Receive against ${current?.number ?? "purchase order"}` : "Select purchase orders"}</DialogTitle>
          <DialogDescription>{onSelectBill ? `${party} · Select a purchase order to enter the quantities received now. Remaining quantities stay open for the next bill.` : `${party} · Each selected PO has its own receipt. Remaining quantities stay on the original order.`}</DialogDescription>
        </DialogHeader>
        {stage === "select" && <div className="space-y-4">
          <div className="grid gap-3">{orders.map((order) => <label key={order.id} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 ${selected.includes(order.id) ? "border-primary/50 bg-primary/5" : "bg-card"}`}>
            <input type={onSelectBill ? "radio" : "checkbox"} name="purchase-order-selection" disabled={selecting} aria-label={`Select purchase order ${order.number}`} className="mt-1 size-4 shrink-0" checked={selected.includes(order.id)} onChange={(event) => setSelected((old) => event.target.checked ? onSelectBill ? [order.id] : [...new Set([...old, order.id])] : old.filter((id) => id !== order.id))} />
            <span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><strong className="[overflow-wrap:anywhere]">{order.number}</strong><span className="text-xs text-muted-foreground">{order.transactionDate} · {order.status}</span></span><span className="mt-1 block text-xs text-muted-foreground">{order.inventory} · {order.currency}</span><span className="mt-3 block whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{order.memo || "No memo"}</span></span>
          </label>)}</div>
          {selectionError && <p role="alert" className="text-sm text-rose-600">{selectionError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={selecting} onClick={() => setStage("closed")}>Cancel</Button><Button type="button" disabled={!selected.length || selected.some(id => !orders.some(order => order.id === id)) || selecting} onClick={async () => {
            if (!selected.length || selected.some(id => !orders.some(order => order.id === id))) return;
            if (!onSelectBill) { setStage("receive"); return; }
            setSelecting(true); setSelectionError("");
            try { await onSelectBill(selected[0]); setStage("closed"); }
            catch (error) { setSelectionError(error instanceof Error ? error.message : "Could not load purchase order."); }
            finally { setSelecting(false); }
          }}>{selecting ? "Loading…" : onSelectBill ? "Use selected PO" : "Receive selected orders"}</Button></div>
        </div>}
        {stage === "receive" && current && <><p className="text-sm text-muted-foreground">{selected.length} selected order{selected.length === 1 ? "" : "s"} left to process.</p><PurchaseOrderReceiving key={current.id} orderId={current.id} companyId={companyId} onSaved={() => {
          onSaved();
          if (selected.length > 1) setSelected((old) => old.slice(1));
          else { setStage("closed"); onComplete(); }
        }} /></>}
      </DialogContent>
    </Dialog>
  </>;
}
