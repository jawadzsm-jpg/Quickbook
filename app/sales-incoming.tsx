"use client";
import { useEffect, useState } from "react";
import { Minus, Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
type Incoming = { id: number; itemName: string; sku: string; itemNumber: string; companyId: number; locationName: string; quantity: number; currency: string; price: number | null };
export function SalesIncoming({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<Incoming[]>([]);
  const [query, setQuery] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/inventory-overview", { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted) setRows(data.activity.incoming); })
      .catch(error => { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not load incoming items."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const filtered = rows.filter(row => row.companyId === companyId && `${row.itemName} ${row.sku} ${row.itemNumber}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-4 rounded-xl border bg-background p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Incoming items</h2><p className="text-sm text-muted-foreground">Items still awaiting receipt. Prices shown are selling prices.</p></div><Button variant="outline" onClick={() => setMinimized(!minimized)}>{minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}{minimized ? "Restore" : "Minimize"}</Button></div>{!minimized && <><div className="flex flex-wrap gap-3"><Input className="min-w-0 flex-1" aria-label="Search incoming items" placeholder="Search item, SKU or item number" value={query} onChange={event => setQuery(event.target.value)} /><Button disabled={loading} variant="outline" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}><RefreshCw className="size-4" />Refresh</Button></div><div className="grid gap-3 lg:grid-cols-2">{filtered.map(row => <article key={row.id} className="min-w-0 rounded-lg border p-4"><h3 className="break-words font-semibold">{row.itemName}</h3><p className="my-2 break-words text-sm text-muted-foreground">{row.sku} · #{row.itemNumber} · {row.locationName}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Expected quantity</dt><dd className="break-words font-semibold tabular-nums">{row.quantity}</dd></div><div><dt className="text-muted-foreground">Selling price · {row.currency}</dt><dd className="break-words font-semibold tabular-nums">{row.price === null ? "—" : row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div></dl></article>)}</div>{!filtered.length && !loading && <p className="text-sm text-muted-foreground">No incoming items found.</p>}</>}</section>;
}
