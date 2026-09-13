"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseOrderReceiving } from "./purchase-order-receiving";

type Order = { id: number; number: string; transactionDate: string; currency: string; memo: string | null; inventory: string };

export function OpenPurchaseOrders({ companyId, party, onSaved, onComplete }: { companyId: number; party: string; onSaved: () => void; onComplete: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stage, setStage] = useState<"closed" | "select" | "receive">("closed");
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
        if (data.orders.length) setStage("select");
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
          <DialogTitle>{stage === "receive" ? `Receive against ${current?.number ?? "purchase order"}` : "Select purchase orders"}</DialogTitle>
          <DialogDescription>{`${party} · Each selected PO has its own receipt. Remaining quantities stay on the original order.`}</DialogDescription>
        </DialogHeader>
        {stage === "select" && <div className="space-y-4">
          <div className="rounded-md border">
            <table className="w-full table-fixed text-sm">
              <thead><tr className="border-b bg-muted/50"><th className="w-10 p-2"><span className="sr-only">Select</span></th><th className="w-1/5 p-2 text-left">Date</th><th className="w-1/3 p-2 text-left">PO number</th><th className="p-2 text-left">Memo</th></tr></thead>
              <tbody>{orders.map((order) => <tr key={order.id} className={`border-b last:border-b-0 ${selected.includes(order.id) ? "bg-accent" : ""}`}>
                <td className="p-2 align-top"><input type="checkbox" aria-label={`Select purchase order ${order.number}`} className="size-4" checked={selected.includes(order.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, order.id] : old.filter((id) => id !== order.id))} /></td>
                <td className="break-words p-2 align-top">{order.transactionDate}</td>
                <td className="p-2 align-top [overflow-wrap:anywhere]"><strong>{order.number}</strong><span className="mt-1 block text-xs text-muted-foreground">{order.inventory} · {order.currency}</span></td>
                <td className="whitespace-pre-wrap p-2 align-top [overflow-wrap:anywhere]">{order.memo || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
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
