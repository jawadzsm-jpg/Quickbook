"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseOrderReceiving } from "./purchase-order-receiving";

type Order = { id: number; number: string; transactionDate: string; currency: string; inventory: string };

export function OpenPurchaseOrders({ companyId, party, onSaved, onComplete }: { companyId: number; party: string; onSaved: () => void; onComplete: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stage, setStage] = useState<"closed" | "prompt" | "select" | "receive">("closed");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/records?kind=open-purchase-orders&companyId=${companyId}&party=${encodeURIComponent(party)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check open purchase orders.");
        setOrders(data.orders);
        setError("");
        if (data.orders.length) setStage("prompt");
      }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [companyId, party, retry]);

  if (error) return <div role="alert" className="rounded-md border p-3 text-sm">{error} <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>;
  if (!orders.length) return null;
  const current = orders.find((order) => order.id === selected[0]);
  return <>
    <Button type="button" variant="outline" onClick={() => setStage("select")}>Receive against open purchase orders ({orders.length})</Button>
    <Dialog open={stage !== "closed"} onOpenChange={(open) => { if (!open) setStage("closed"); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{stage === "prompt" ? "Open POs Exist" : stage === "receive" ? `Receive against ${current?.number ?? "purchase order"}` : "Select purchase orders"}</DialogTitle>
          <DialogDescription>{stage === "prompt" ? "Open purchase orders exist for this vendor. Do you want to receive against one or more of these orders?" : `${party} · Each selected PO has its own receipt. Remaining quantities stay on the original order.`}</DialogDescription>
        </DialogHeader>
        {stage === "prompt" && <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setStage("closed")}>No</Button><Button type="button" onClick={() => setStage("select")}>Yes</Button></div>}
        {stage === "select" && <div className="space-y-4">
          <div className="space-y-2">{orders.map((order) => <label key={order.id} className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1 size-4" checked={selected.includes(order.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, order.id] : old.filter((id) => id !== order.id))} /><span><strong>{order.number}</strong><span className="block text-sm text-muted-foreground">{order.transactionDate} · {order.inventory} · {order.currency}</span></span></label>)}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setStage("closed")}>Cancel</Button><Button type="button" disabled={!selected.length} onClick={() => setStage("receive")}>Receive selected orders</Button></div>
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
