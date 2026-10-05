"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dubaiDay } from "@/lib/document-access";

type Activity = { id: number; type: string; number: string; party: string; transactionDate: string; createdAt: string; status: string; currency: string; total: number; enteredBy: string | null; inventoryName: string | null };
type Result = { key: string; records: Activity[]; total: number; pageSize: number; error?: string };
const enteredTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function InsightsActivity({ companyId, locationId, onOpen }: { companyId: number; locationId: number; onOpen: (id: number) => void }) {
  const [date, setDate] = useState(dubaiDay);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const query = new URLSearchParams({ kind: "transactions", companyId: String(companyId), locationId: String(locationId || 0), enteredDate: date, page: String(page), refresh: String(refresh) }).toString();
  useEffect(() => {
    if (!date || !companyId) return;
    const controller = new AbortController();
    fetch(`/api/records?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load transaction activity."); return data; })
      .then(data => { if (!controller.signal.aborted) setResult({ ...data, key: query }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key: query, records: [], total: 0, pageSize: 50, error: error instanceof Error ? error.message : "Could not load activity." }); });
    return () => controller.abort();
  }, [query, date, companyId]);
  const data = result?.key === query ? result : null;
  const loading = Boolean(date && companyId && !data);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)));
  function selectDate(value: string) { setDate(value); setPage(1); }
  return <section className="min-w-0 space-y-4 rounded-xl border bg-background p-4 shadow-sm sm:p-5" aria-label="Transactions by entry date">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="font-bold">Transactions entered on this day</h3><p className="mt-1 text-sm text-muted-foreground">Entry date in UAE time (UTC+4), including backdated documents. Results follow your role, company and selected inventory.</p></div><div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="insights-entry-date">Entry date</Label><Input id="insights-entry-date" type="date" value={date} onChange={event => selectDate(event.target.value)} className="w-auto" /></div><Button type="button" variant="outline" onClick={() => { selectDate(dubaiDay()); setRefresh(value => value + 1); }}>Today</Button><Button type="button" variant="outline" disabled={loading || !date} onClick={() => { setPage(1); setRefresh(value => value + 1); }}>Refresh</Button></div></div>
    <div aria-live="polite" className="text-sm text-muted-foreground">{!date ? "Select an entry date." : loading ? "Loading transactions…" : data?.error ? <span role="alert" className="text-destructive">{data.error}</span> : `${data?.total ?? 0} transactions entered on ${date}`}</div>
    {data && !data.error && <>
      <Table><TableHeader><TableRow><TableHead>Entered (UAE)</TableHead><TableHead>Document date</TableHead><TableHead>Type / reference</TableHead><TableHead>Customer / supplier</TableHead><TableHead>Inventory / entered by</TableHead><TableHead>Status</TableHead><TableHead responsiveColumn="amount">Amount</TableHead><TableHead>View</TableHead></TableRow></TableHeader><TableBody>
        {data.records.length ? data.records.map(row => <TableRow key={row.id}><TableCell>{enteredTime.format(new Date(row.createdAt))}</TableCell><TableCell>{row.transactionDate}</TableCell><TableCell><p className="capitalize">{row.type}</p><p className="break-all font-mono text-xs">{row.number}</p></TableCell><TableCell>{row.party}</TableCell><TableCell><p>{row.inventoryName || "Company-wide"}</p><p className="text-xs text-muted-foreground">{row.enteredBy || "User not recorded"}</p></TableCell><TableCell className="capitalize">{row.status}</TableCell><TableCell responsiveColumn="amount" className="tabular-nums">{Number(row.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</TableCell><TableCell><Button type="button" variant="outline" size="sm" onClick={() => onOpen(row.id)} aria-label={`View ${row.number}`}>View</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No accessible transactions were entered on this date.</TableCell></TableRow>}
      </TableBody></Table>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>Page {page} of {pages} · {data.total} entries</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>
    </>}
  </section>;
}
