"use client";
import { useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Match = { id: number; lineId: number | null; type: string; number: string; date: string; party: string; currency: string; status: string; inventory: string | null; serialNumber: string; description: string; sku: string | null; quantity: number | null; unitPrice: number | null; total: number; comments: string; scope: "item" | "document" };
export function SerialNumberSearch({ companyId, onOpen }: { companyId: number; onOpen: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState("all");
  const requestId = useRef(0);
  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    const id = ++requestId.current;
    setLoading(true); setError(""); setResults([]); setSearched("");
    try {
      const response = await fetch(`/api/serial-search?companyId=${companyId}&q=${encodeURIComponent(term)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not search serial numbers.");
      if (id !== requestId.current) return;
      setResults(data.results); setTruncated(data.truncated); setSearched(term); setFilter("all");
    } catch (error) { if (id === requestId.current) setError(error instanceof Error ? error.message : "Search failed."); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  const shown = results.filter(row => filter === "all" || row.type === filter);
  const typeLabel = (row: Match) => row.type === "bill" ? "Purchase" : "Sale";
  const money = (currency: string, value: number) => `${currency} ${value.toFixed(2)}`;
  return <section className="space-y-5">
    <div className="rounded-xl border bg-card p-5 text-card-foreground"><h2 className="font-bold">Find purchases and sales by serial number</h2><p className="mt-1 text-sm text-muted-foreground">Search a full or partial serial number across all inventories in the selected company.</p><form onSubmit={search} className="mt-4 flex flex-wrap gap-3"><label className="relative min-w-0 flex-1 basis-60"><span className="sr-only">Serial number</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input required maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Enter serial number" className="pl-9" /></label><Button type="submit" disabled={loading || !query.trim()} className="brand-primary-button"><Search className="size-4" />{loading ? "Searching…" : "Find Serial Number"}</Button></form></div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {searched && <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-1.5 shadow-sm"><div className="flex gap-1" role="group" aria-label="Match type">{[["all","All"],["bill","Purchases"],["invoice","Sales"]].map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`h-8 shrink-0 rounded-md px-3 text-sm font-medium transition-colors ${filter === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>)}</div><p role="status" className="px-2 text-sm text-muted-foreground">{results.length} matches for <strong className="text-foreground">{searched}</strong></p></div>
      {truncated && <p className="text-xs text-muted-foreground">Showing the latest 100 matches. Enter more of the serial number to narrow your search.</p>}
      {shown.length === 0 ? <p className="rounded-xl border p-5 text-muted-foreground">No matching documents found.</p> : <>
        {/* Table from 1,280 px; narrower screens show one card per match. */}
        <div className="hidden overflow-auto rounded-xl border bg-card xl:block"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Type / Date","Document","Item / Serial Number","Customer / Vendor","Inventory","Qty","Rate","Total","Status"].map(title => <th key={title} className={`p-3 font-semibold whitespace-nowrap ${["Qty","Rate","Total"].includes(title) ? "text-right" : ""}`}>{title}</th>)}</tr></thead><tbody>{shown.map(row => <tr key={`${row.id}-${row.lineId ?? 'document'}`} className="border-t align-top"><td className="p-3 whitespace-nowrap">{typeLabel(row)}<span className="block whitespace-nowrap text-xs text-muted-foreground tabular-nums">{row.date}</span></td><td className="p-3"><Button variant="link" className="h-auto p-0" onClick={() => onOpen(row.id)}>{row.number}</Button><p className="text-xs text-muted-foreground">{row.scope === "item" ? "Item match" : "Document match"}</p></td><td className="min-w-64 max-w-xl p-3"><p className="font-medium">{row.sku ? `${row.sku} · ` : ""}{row.description}</p><p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{row.serialNumber}</p>{row.comments && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.comments}</p>}</td><td className="p-3">{row.party}</td><td className="p-3">{row.inventory || "—"}</td><td className="p-3 text-right tabular-nums">{row.quantity ?? "—"}</td><td className="p-3 whitespace-nowrap text-right tabular-nums">{row.unitPrice === null ? "—" : money(row.currency, row.unitPrice)}</td><td className="p-3 whitespace-nowrap text-right font-semibold tabular-nums">{money(row.currency, row.total)}</td><td className="p-3 capitalize">{row.status}</td></tr>)}</tbody></table></div>
        <div className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:hidden">{shown.map(row => <article key={`${row.id}-${row.lineId ?? 'document'}`} className="min-w-0 rounded-xl border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen(row.id)}>{row.number}</Button><p className="text-xs text-muted-foreground">{typeLabel(row)} · <span className="tabular-nums">{row.date}</span> · {row.scope === "item" ? "Item match" : "Document match"}</p></div><span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{money(row.currency, row.total)}</span></div>
          <p className="mt-3 font-medium break-words">{row.sku ? `${row.sku} · ` : ""}{row.description}</p><p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{row.serialNumber}</p>{row.comments && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.comments}</p>}
          <dl className="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-2 text-xs">{([["Customer / Vendor", row.party], ["Inventory", row.inventory || "—"], ["Qty · Rate", `${row.quantity ?? "—"} · ${row.unitPrice === null ? "—" : money(row.currency, row.unitPrice)}`], ["Status", row.status.charAt(0).toUpperCase() + row.status.slice(1)]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>
        </article>)}</div>
      </>}
    </div>}
  </section>;
}
