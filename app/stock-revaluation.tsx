"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Stock = { id: number; name: string; sku: string; itemNumber: string; description: string; specifications: string; quantity: number; cost: number; grnCost: number; salesPrice: number; companyId: number; companyName: string; currency: string; locationId: number; locationName: string };
export function StockRevaluation() {
  const [records, setRecords] = useState<Stock[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { cost: string; price: string }>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stock-revaluation", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load stock");
      setRecords(data.records); setCanEdit(data.canEdit); setDrafts({}); setSelected(new Set());
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load stock"); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => records.filter((r) => (!location || String(r.locationId) === location) && [r.name, r.sku, r.itemNumber, r.description, r.companyName, r.locationName].join(" ").toLowerCase().includes(search.toLowerCase())), [records, location, search]);
  const locations = [...new Map(records.map((r) => [r.locationId, `${r.companyName} · ${r.locationName}`])).entries()];
  const toggle = (id: number, checked: boolean) => setSelected((old) => { const next = new Set(old); if (checked) next.add(id); else next.delete(id); return next; });
  const edit = (r: Stock, field: "cost" | "price", value: string) => { setDrafts((old) => ({ ...old, [r.id]: { ...(old[r.id] ?? { cost: String(r.cost), price: String(r.salesPrice) }), [field]: value } })); toggle(r.id, true); };
  async function save() {
    const rows = records.filter((r) => selected.has(r.id));
    if (!rows.length || rows.length > 100) return toast.error("Select 1–100 items to save.");
    if (rows.some((r) => { const draft = drafts[r.id]; return draft && [draft.cost, draft.price].some((v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0); })) return toast.error("Enter valid non-negative costs and prices.");
    setSaving(true);
    try {
      const response = await fetch("/api/stock-revaluation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: rows.map((r) => ({ id: r.id, cost: Number(drafts[r.id]?.cost ?? r.cost), salesPrice: Number(drafts[r.id]?.price ?? r.salesPrice), expectedCost: r.cost, expectedPrice: r.salesPrice, expectedQuantity: r.quantity })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save revaluation");
      toast.success(`${data.saved} items saved`); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed"); }
    finally { setSaving(false); }
  }
  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div><h2 className="text-lg font-bold">Stock Revaluation</h2><p className="text-sm text-slate-500">All authorized inventories. GRN Cost sets the new unit cost; Price sets the selling price. Quantities stay unchanged.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saving || loading} onClick={() => void load()}>Refresh / discard edits</Button>{canEdit && <Button disabled={saving || loading || !selected.size} onClick={() => void save()}>{saving ? "Saving…" : `Save selected (${selected.size})`}</Button>}</div></div><div className="flex flex-wrap gap-4 p-4"><label className="flex items-center gap-2 text-sm">Inventory<select className="rounded-md border p-2" value={location} onChange={(e) => setLocation(e.target.value)}><option value="">All inventories</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="ml-auto flex items-center gap-2 text-sm">Search<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, SKU, company or inventory" /></label></div><div className="max-h-[70vh] overflow-auto"><Table className="min-w-[1000px]"><TableHeader className="sticky top-0 z-10 bg-slate-100"><TableRow><TableHead><Checkbox disabled={!canEdit || saving || loading || !visible.length} aria-label="Select visible items" checked={!!visible.length && visible.every((r) => selected.has(r.id))} onCheckedChange={(checked) => setSelected((old) => { const next = new Set(old); visible.forEach((r) => { if (checked === true) next.add(r.id); else next.delete(r.id); }); return next; })} /></TableHead><TableHead className="w-[60%]">SPECS · Stock Revaluation</TableHead><TableHead>QTY</TableHead><TableHead>COST</TableHead><TableHead>GRN COST</TableHead><TableHead>PRICE</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={6}>Loading inventories…</TableCell></TableRow> : visible.length ? visible.map((r) => <TableRow key={r.id} className="align-top"><TableCell><Checkbox disabled={!canEdit || saving} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} aria-label={`Select ${r.name} in ${r.locationName}`} /></TableCell><TableCell className="whitespace-normal"><p className="font-bold text-blue-700 underline">{r.name}</p><p className="mt-1 whitespace-normal break-words text-sm">{r.description}</p><p className="mt-2 text-xs text-slate-500">{r.companyName} · {r.locationName} · {r.currency} · SKU {r.sku} · <span className="text-rose-600">#{r.itemNumber}</span></p></TableCell><TableCell className="font-bold">{r.quantity}</TableCell><TableCell>{money(r.cost)}</TableCell><TableCell><Input className="w-32" aria-label={`New cost for ${r.name} in ${r.locationName}`} type="number" min="0" step="0.01" disabled={!canEdit || saving} value={drafts[r.id]?.cost ?? r.cost} onChange={(e) => edit(r, "cost", e.target.value)} /><p className="mt-1 text-xs text-slate-500">Last GRN: {money(r.grnCost)}</p></TableCell><TableCell><Input className="w-32" aria-label={`Price for ${r.name} in ${r.locationName}`} type="number" min="0" step="0.01" disabled={!canEdit || saving} value={drafts[r.id]?.price ?? r.salesPrice} onChange={(e) => edit(r, "price", e.target.value)} /></TableCell></TableRow>) : <TableRow><TableCell colSpan={6}>No matching stock found.</TableCell></TableRow>}</TableBody></Table></div></section>;
}
