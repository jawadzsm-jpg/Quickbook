"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ExchangeRateRecord = { id: number; companyId: number; currencyCode: string; rate: number; active: boolean };
type Company = { id: number; name: string; baseCurrency: string };

export function CurrencyRateCenter({ company, currencies, onCompanyChanged, onRatesChanged }: { company?: Company; currencies: string[]; onCompanyChanged: () => Promise<void>; onRatesChanged: () => Promise<void> }) {
  const [rates, setRates] = useState<ExchangeRateRecord[]>([]);
  const [baseCurrency, setBaseCurrency] = useState(company?.baseCurrency ?? "AED");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  const [editing, setEditing] = useState<ExchangeRateRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadRates() {
    if (!company?.id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/exchange-rates?companyId=${company.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load exchange rates");
      setRates(data.rates);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load exchange rates"); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { setBaseCurrency(company?.baseCurrency ?? "AED"); void loadRates(); }, [company?.id, company?.baseCurrency]);

  function addRate() {
    const first = currencies.find((currency) => currency !== company?.baseCurrency && !rates.some((entry) => entry.currencyCode === currency)) ?? currencies.find((currency) => currency !== company?.baseCurrency) ?? "USD";
    setEditing(null); setSelectedCurrency(first); setRate(""); setOpen(true);
  }

  function editRate(entry: ExchangeRateRecord) {
    setEditing(entry); setSelectedCurrency(entry.currencyCode); setRate(String(entry.rate)); setOpen(true);
  }

  async function saveBaseCurrency(event: FormEvent) {
    event.preventDefault(); if (!company) return; setSaving(true);
    try {
      const response = await fetch("/api/workspaces", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, baseCurrency }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save base currency");
      await onCompanyChanged(); await loadRates(); await onRatesChanged(); toast.success("Base currency updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save base currency"); }
    finally { setSaving(false); }
  }

  async function saveRate(event: FormEvent) {
    event.preventDefault(); if (!company) return; setSaving(true);
    try {
      const response = await fetch("/api/exchange-rates", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, ...(editing ? { id: editing.id } : { currencyCode: selectedCurrency }), rate: Number(rate) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save exchange rate");
      setOpen(false); await loadRates(); await onRatesChanged(); toast.success(editing ? "Exchange rate updated" : "Exchange rate added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save exchange rate"); }
    finally { setSaving(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">Exchange rates</h2><p className="mt-1 text-sm text-slate-500">Rates convert transaction amounts into {company?.baseCurrency}. Example: 1 USD × rate = amount in {company?.baseCurrency}.</p></div><Button onClick={addRate} disabled={!company}><Plus className="size-4" />Add exchange rate</Button></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Currency</TableHead><TableHead>Conversion</TableHead><TableHead>Rate</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">Loading exchange rates…</TableCell></TableRow> : rates.map((entry) => <TableRow key={entry.id}><TableCell><div className="flex items-center gap-2"><span className="font-semibold">{entry.currencyCode}</span>{entry.currencyCode === company?.baseCurrency ? <Badge>Base</Badge> : null}</div></TableCell><TableCell><span className="flex items-center gap-2 text-sm text-slate-600">1 {entry.currencyCode}<ArrowRight className="size-4" />{Number(entry.rate).toLocaleString("en-AE", { maximumFractionDigits: 6 })} {company?.baseCurrency}</span></TableCell><TableCell className="font-mono">{Number(entry.rate).toFixed(6)}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" disabled={entry.currencyCode === company?.baseCurrency} onClick={() => editRate(entry)}><Pencil className="size-4" />Edit</Button></TableCell></TableRow>)}
        {!loading && !rates.length ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">No exchange rates configured.</TableCell></TableRow> : null}
      </TableBody></Table></div>
    </section>
    <form onSubmit={saveBaseCurrency} className="h-fit space-y-4 rounded-xl border bg-white p-5 shadow-sm"><div><h2 className="font-bold">Company base currency</h2><p className="mt-1 text-sm text-slate-500">Financial reports and journal entries use this currency. Its exchange rate is always 1.</p></div><div className="space-y-2"><Label>{company?.name}</Label><Select value={baseCurrency} onValueChange={setBaseCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" disabled={saving || !company}>{saving ? "Saving…" : "Save base currency"}</Button></form>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? `Edit ${editing.currencyCode} rate` : "Add exchange rate"}</DialogTitle><DialogDescription>Enter how much one unit of the selected currency is worth in {company?.baseCurrency}.</DialogDescription></DialogHeader><form onSubmit={saveRate} className="space-y-4"><div className="space-y-2"><Label>Currency</Label><Select value={selectedCurrency} disabled={Boolean(editing)} onValueChange={setSelectedCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.filter((currency) => currency !== company?.baseCurrency).map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Exchange rate to {company?.baseCurrency}</Label><Input type="number" min="0.000001" max="1000000" step="0.000001" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="3.672500" required /><p className="text-xs text-slate-500">1 {selectedCurrency} = {rate || "…"} {company?.baseCurrency}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save exchange rate"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
