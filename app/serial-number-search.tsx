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
  return <section className="space-y-5">
    <div className="rounded-xl border bg-white p-5"><h2 className="font-bold">Find purchases and sales by serial number</h2><p className="mt-1 text-sm text-slate-500">Search a full or partial serial number across all inventories in the selected company.</p><form onSubmit={search} className="mt-4 flex flex-wrap gap-3"><label className="min-w-0 flex-1"><span className="sr-only">Serial number</span><Input required maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Enter serial number" /></label><Button type="submit" disabled={loading || !query.trim()} className="brand-primary-button"><Search className="size-4" />{loading ? "Searching…" : "Find Serial Number"}</Button></form></div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {searched && <div className="space-y-3"><p role="status" className="text-sm">{results.length} matches for <strong>{searched}</strong>{truncated ? " — showing the latest 100 matches. Enter more of the serial number to narrow your search." : ""}</p><div className="flex gap-2">{[["all","All"],["bill","Purchases"],["invoice","Sales"]].map(([value,label]) => <Button key={value} variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</Button>)}</div>
      {shown.length === 0 ? <p className="rounded-xl border p-5 text-slate-500">No matching documents found.</p> : <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Type / Date","Document","Item / Serial Number","Customer / Vendor","Inventory","Qty","Rate","Total","Status"].map(title => <th key={title} className="p-3 whitespace-nowrap">{title}</th>)}</tr></thead><tbody>{shown.map(row => <tr key={`${row.id}-${row.lineId ?? 'document'}`} className="border-t align-top"><td className="p-3 whitespace-nowrap">{row.type === "bill" ? "Purchase" : "Sale"}<p className="text-xs text-slate-500">{row.date}</p></td><td className="p-3"><Button variant="link" className="h-auto p-0" onClick={() => onOpen(row.id)}>{row.number}</Button><p className="text-xs text-slate-500">{row.scope === "item" ? "Item match" : "Document match"}</p></td><td className="min-w-64 max-w-xl p-3"><p className="font-medium">{row.sku ? `${row.sku} · ` : ""}{row.description}</p><p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{row.serialNumber}</p>{row.comments && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{row.comments}</p>}</td><td className="p-3">{row.party}</td><td className="p-3">{row.inventory || "—"}</td><td className="p-3">{row.quantity ?? "—"}</td><td className="p-3 whitespace-nowrap">{row.unitPrice === null ? "—" : `${row.currency} ${row.unitPrice.toFixed(2)}`}</td><td className="p-3 whitespace-nowrap">{row.currency} {row.total.toFixed(2)}</td><td className="p-3">{row.status}</td></tr>)}</tbody></table></div>}
    </div>}
  </section>;
}
