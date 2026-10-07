"use client";
import { useEffect, useState } from "react";
import { Minus, Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiDay } from "@/lib/document-access";
import { toast } from "sonner";
type Customer = { id: number; name: string; currency: string; balance: number; status: string };
type Activity = { id: number; number: string; type: string; status: string; canOpen: boolean };
export function SalesDailyWork({ companyId, onOpen }: { companyId: number; onOpen: (id: number) => void }) {
  const [date, setDate] = useState(dubaiDay);
  const [data, setData] = useState<{ customers: Customer[]; activity: Activity[] }>({ customers: [], activity: [] });
  const [minimized, setMinimized] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // The company list loads after sign-in; wait for a real company instead of asking for company 0.
    if (!date || !companyId) return;
    const controller = new AbortController();
    fetch(`/api/sales-work?companyId=${companyId}&date=${date}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(error => { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not load daily work."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, date, refresh]);
  const balances = new Map<string, number>();
  data.customers.forEach(customer => balances.set(customer.currency, (balances.get(customer.currency) || 0) + customer.balance));
  return <section className="space-y-4 rounded-xl border bg-background p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">My daily work</h2><p className="text-sm text-muted-foreground">Your activity in UAE time and your assigned customer balances.</p></div><Button variant="outline" onClick={() => setMinimized(!minimized)}>{minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}{minimized ? "Restore" : "Minimize"}</Button></div>
    {!minimized && <><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Work date<Input type="date" value={date} onChange={event => { setDate(event.target.value); setLoading(Boolean(event.target.value)); }} /></label><Button variant="outline" disabled={loading || !date} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}><RefreshCw className="size-4" />Refresh</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Active customers</p><strong>{data.customers.filter(customer => customer.status === "active").length}</strong></div>{[...balances].map(([currency, balance]) => <div key={currency} className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">My customer balance · {currency}</p><strong className="tabular-nums">{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>)}</div>
      <div className="grid gap-3 md:grid-cols-2">{data.activity.map(row => <article key={row.id} className="min-w-0 rounded-lg border p-4"><h3 className="break-words font-semibold">{row.number} · {row.type}</h3><p className="my-2 text-sm text-muted-foreground">{row.status}</p>{row.canOpen && <Button variant="outline" onClick={() => onOpen(row.id)}>Open</Button>}</article>)}</div>{!loading && !data.activity.length && <p className="text-sm text-muted-foreground">No documents created on this day.</p>}
    </>}
  </section>;
}
