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
      if (controller.signal.aborted) return;
      setSelected(undefined); setDocuments(data.documents); setError(""); setOpen(data.documents.length > 0);
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
        <div className="space-y-3">{documents.map(doc=><label key={doc.id} className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-4 ${selected===doc.id?'border-primary bg-primary/5':'bg-card'}`}><input className="mt-1 size-4 shrink-0" type="radio" name="sales-source" aria-label={`Select ${doc.type} ${doc.number}`} checked={selected===doc.id} onChange={()=>setSelected(doc.id)}/><span className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><span className="min-w-0 [overflow-wrap:anywhere]"><strong>{doc.number}</strong><span className="block text-sm capitalize">{doc.type}</span><span className="block text-xs text-muted-foreground">{doc.transactionDate} · {doc.inventory}</span></span><span className="min-w-0 text-sm sm:text-right"><span className="block text-xs text-muted-foreground">Original amount</span><strong className="break-words tabular-nums">{doc.currency} {doc.total.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground [overflow-wrap:anywhere]">{doc.memo || '—'}</span></span></span></label>)}</div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" disabled={!documents.some(doc=>doc.id===selected)} onClick={() => { if (selected && documents.some(doc=>doc.id===selected)) { setOpen(false); onSelect(selected); } }}>Select quantities to invoice</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
