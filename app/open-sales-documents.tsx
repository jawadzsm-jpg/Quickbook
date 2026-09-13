"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Source = { id: number; type: string; number: string; transactionDate: string; total: number; currency: string; memo: string | null; inventory: string };

export function OpenSalesDocuments({ companyId, party, onSelect }: { companyId: number; party: string; onSelect: (id: number) => void }) {
  const [documents, setDocuments] = useState<Source[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/records?kind=open-sales-documents&companyId=${companyId}&party=${encodeURIComponent(party)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check customer documents.");
      setDocuments(data.documents); setError(""); setOpen(data.documents.length > 0);
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [companyId, party, retry]);
  if (error) return <div role="alert" className="rounded-md border p-3 text-sm">{error} <Button type="button" variant="outline" onClick={() => setRetry((old) => old + 1)}>Retry</Button></div>;
  if (!documents.length) return null;
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>Select customer document ({documents.length})</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>Available customer documents</DialogTitle><DialogDescription>{party} · Select a Sales Order, Proforma Invoice or Estimate. Invoice delivered quantities now and keep the remainder open.</DialogDescription></DialogHeader>
        <div className="rounded-md border"><table className="w-full table-fixed text-sm">
          <thead><tr className="border-b bg-muted/50"><th className="w-10 p-2"><span className="sr-only">Select</span></th><th className="w-1/5 p-2 text-left">Date</th><th className="w-1/3 p-2 text-left">Document</th><th className="p-2 text-left">Original amount / Memo</th></tr></thead>
          <tbody>{documents.map((doc) => <tr key={doc.id} className={`border-b last:border-b-0 ${selected === doc.id ? "bg-accent" : ""}`}>
            <td className="p-2 align-top"><input type="radio" name="sales-source" aria-label={`Select ${doc.type} ${doc.number}`} checked={selected === doc.id} onChange={() => setSelected(doc.id)} /></td>
            <td className="break-words p-2 align-top">{doc.transactionDate}</td>
            <td className="p-2 align-top [overflow-wrap:anywhere]"><strong>{doc.number}</strong><span className="block capitalize">{doc.type}</span><span className="text-xs text-muted-foreground">{doc.inventory}</span></td>
            <td className="p-2 align-top [overflow-wrap:anywhere]">{doc.currency} {doc.total.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="mt-1 block whitespace-pre-wrap text-muted-foreground">{doc.memo || "—"}</span></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" disabled={!selected} onClick={() => { if (selected) { setOpen(false); onSelect(selected); } }}>Select quantities to invoice</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
