"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ReceiptLine = { id: number; description: string; quantity: number; received: number; remaining: number };
export function PurchaseOrderReceiving({ orderId, companyId, onSaved }: { orderId: number; companyId: number; onSaved: () => void }) {
  const [data, setData] = useState<{ order: { locationId: number; number: string; status: string }; lines: ReceiptLine[] }>();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/records?kind=po-receiving&companyId=' + companyId + '&orderId=' + orderId, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load purchase order.");
      setData(result);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [companyId, orderId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    const lines = data.lines.filter((line) => Number(quantities[line.id]) > 0).map((line) => ({ orderLineId: line.id, quantity: Number(quantities[line.id]) }));
    if (!lines.length) return setError("Enter the quantities received on at least one line.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "transactions", type: "item receipt", companyId, locationId: data.order.locationId, purchaseOrderId: orderId, transactionDate: date, memo, lines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create item receipt.");
      toast.success("Item receipt saved. The PO keeps any remaining quantities.");
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create item receipt."); }
    finally { setSaving(false); }
  }
  return <section className="document-internal-only rounded-xl border bg-slate-50 p-4">
    <h3 className="font-semibold">Receive items from this purchase order</h3>
    <p className="mt-1 text-sm text-slate-500">Enter only the quantities delivered now. Remaining quantities stay on this PO for the next receipt.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {!data ? <p className="mt-3 text-sm">{error ? "Close and reopen the purchase order to retry." : "Loading quantities…"}</p> : <form onSubmit={save} className="mt-4 grid gap-4">
      <label className="grid max-w-xs gap-2 text-sm">Receipt date<Input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="overflow-auto"><table className="w-full table-fixed text-sm"><thead><tr className="border-b"><th className="w-1/2 p-2 text-left">Item</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Receive now</th></tr></thead><tbody>{data.lines.map((line) => <tr key={line.id} className="border-b"><td className="break-words p-2">{line.description}</td><td className="p-2 text-right">{line.quantity}</td><td className="p-2 text-right">{line.received}</td><td className="p-2 text-right">{line.remaining}</td><td className="p-2"><Input aria-label={'Receive ' + line.description} type="number" min="0" max={line.remaining} step="any" disabled={saving || line.remaining <= 0} value={quantities[line.id] || ""} placeholder="0" onChange={(event) => setQuantities((old) => ({ ...old, [line.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
      <label className="grid gap-2 text-sm">Receipt memo<Input value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setQuantities(Object.fromEntries(data.lines.map((line) => [line.id, String(line.remaining)])))}>Fill remaining quantities</Button><Button disabled={saving || !data.lines.some((line) => line.remaining > 0)} type="submit">{saving ? "Saving…" : "Create item receipt"}</Button></div>
    </form>}
  </section>;
}
