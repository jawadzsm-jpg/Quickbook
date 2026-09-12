"use client";

import { useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Entry = { id: number; date: string; reference: string; type: string; party: string; memo: string; inventory: string; debit: number; credit: number; transaction_id: number | null };
type History = { currency: string; page: number; pageSize: number; total: number; rows: Entry[] };

export function AccountHistory({ accountId, companyId, onOpen }: { accountId: number; companyId: number; onOpen: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data?: History; error?: string }>({ key: "" });
  const key = `${companyId}:${accountId}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/account-history?companyId=${companyId}&accountId=${accountId}&page=${page}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load account history.");
      if (!controller.signal.aborted) setState({ key, data });
    }).catch((error) => { if (!controller.signal.aborted) setState({ key, error: error.message || "Could not load account history." }); });
    return () => controller.abort();
  }, [accountId, companyId, page, key]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  const money = (amount: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: data?.currency || "AED" }).format(Number(amount));
  return <section className="space-y-3 border-t pt-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Transaction history</h3><p className="text-sm text-muted-foreground">Posted entries across all company inventories. Debits and credits are in {data?.currency || "the company’s home currency"}.</p></div><Button type="button" variant="ghost" size="icon" title="Refresh history" aria-label="Refresh history" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="size-4" /></Button></div>
    {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : !data ? <p role="status" className="text-sm">Loading transaction history…</p> : <>
      <div className="max-h-[45vh] overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Date / reference</TableHead><TableHead>Transaction</TableHead><TableHead>Inventory</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead><span className="sr-only">View source</span></TableHead></TableRow></TableHeader><TableBody>{data.rows.length ? data.rows.map((entry) => <TableRow key={entry.id}><TableCell className="align-top"><p className="whitespace-nowrap">{entry.date}</p><p className="mt-1 break-all text-xs">{entry.reference}</p></TableCell><TableCell className="max-w-80 whitespace-normal align-top"><p className="capitalize font-medium">{entry.type}</p>{entry.party && <p>{entry.party}</p>}{entry.memo && <p className="mt-1 break-words text-xs text-muted-foreground">{entry.memo}</p>}</TableCell><TableCell className="whitespace-normal align-top">{entry.inventory}</TableCell><TableCell className="text-right align-top whitespace-nowrap">{money(entry.debit)}</TableCell><TableCell className="text-right align-top whitespace-nowrap">{money(entry.credit)}</TableCell><TableCell className="align-top">{entry.transaction_id && <Button type="button" variant="ghost" size="icon" title="View transaction" aria-label={`View transaction ${entry.reference}`} onClick={() => onOpen(entry.transaction_id!)}><Eye className="size-4" /></Button>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No posted transactions for this account.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex items-center justify-between gap-2 text-sm"><span>{data.total} entries · Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </>}
  </section>;
}
