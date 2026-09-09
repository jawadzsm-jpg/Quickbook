"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileBarChart2, FileText, History, Percent, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type VatSummary = { outputVat: number; inputVat: number; adjustments: number; netVatDue: number; transactionLines: number };
type VatReturn = { id: number; periodStart: string; periodEnd: string; reference: string; outputVat: number; inputVat: number; adjustments: number; netVatDue: number; status: string; filedAt: string };
type VatAdjustment = { id: number; adjustmentDate: string; reference: string; direction: "increase" | "decrease"; amount: number; reason: string };

function currentQuarter() {
  const now = new Date();
  const startMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const money = (value: number, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export function VatManagementCenter({ companyId, companyName, locationId, locationName, currency, canWrite, canManageCodes, onOpenReport, onManageCodes }: { companyId: number; companyName: string; locationId: number; locationName: string; currency: string; canWrite: boolean; canManageCodes: boolean; onOpenReport: (key: string, period: { start: string; end: string }) => void; onManageCodes: () => void }) {
  const quarter = useMemo(() => currentQuarter(), []);
  const [periodStart, setPeriodStart] = useState(quarter.start);
  const [periodEnd, setPeriodEnd] = useState(quarter.end);
  const [summary, setSummary] = useState<VatSummary>({ outputVat: 0, inputVat: 0, adjustments: 0, netVatDue: 0, transactionLines: 0 });
  const [returns, setReturns] = useState<VatReturn[]>([]);
  const [adjustments, setAdjustments] = useState<VatAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [fileReference, setFileReference] = useState("");
  const [adjustment, setAdjustment] = useState({ adjustmentDate: new Date().toISOString().slice(0, 10), reference: "", direction: "increase", amount: "", reason: "" });

  const loadVat = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/vat-management?companyId=${companyId}&locationId=${locationId}&periodStart=${periodStart}&periodEnd=${periodEnd}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load VAT information");
      setSummary(data.summary); setReturns(data.returns); setAdjustments(data.adjustments);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load VAT information"); }
    finally { setLoading(false); }
  }, [companyId, locationId, periodEnd, periodStart]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadVat(); }, [loadVat]);

  async function submitFile(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/vat-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "file", companyId, locationId, periodStart, periodEnd, reference: fileReference }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not file VAT return");
      setFileOpen(false); setFileReference(""); await loadVat(); toast.success("VAT return filed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not file VAT return"); }
    finally { setSaving(false); }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/vat-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "adjust", companyId, locationId, ...adjustment, amount: Number(adjustment.amount) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not post VAT adjustment");
      setAdjustOpen(false); setAdjustment({ adjustmentDate: new Date().toISOString().slice(0, 10), reference: "", direction: "increase", amount: "", reason: "" }); await loadVat(); toast.success("VAT adjustment posted to the ledger");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not post VAT adjustment"); }
    finally { setSaving(false); }
  }

  const reportGroups = [
    { title: "VAT reports", items: [
      ["VAT Summary Report", "vat-summary"], ["VAT Detail Report", "vat-detail"], ["Unassigned VAT Amounts Detail Report", "vat-unassigned"], ["VAT Exception Report", "vat-exceptions"], ["VAT Item Summary", "vat-item-summary"],
    ] },
    { title: "International VAT", items: [["EC Sales List", "ec-sales"], ["Reverse Charge List", "reverse-charge"]] },
  ] as const;

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><div className="brand-soft-icon grid size-11 place-items-center rounded-xl"><Percent className="size-5" /></div><div><h2 className="font-bold text-slate-900">Manage VAT</h2><p className="text-sm text-slate-500">{companyName} · {locationName} · amounts in {currency}</p></div></div><div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label className="text-xs">Period start</Label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></div><div className="space-y-1"><Label className="text-xs">Period end</Label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div><Button variant="outline" onClick={loadVat} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><VatMetric label="Output VAT" value={summary.outputVat} currency={currency} /><VatMetric label="Input VAT" value={summary.inputVat} currency={currency} /><VatMetric label="Adjustments" value={summary.adjustments} currency={currency} /><VatMetric label="Net VAT due" value={summary.netVatDue} currency={currency} strong /></div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="font-bold text-slate-900">VAT reports and lists</h3><p className="mt-1 text-sm text-slate-500">Every report uses posted VAT codes, transaction lines and exchange rates.</p></div>{reportGroups.map((group) => <div key={group.title} className="border-b last:border-b-0"><div className="bg-slate-50 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">{group.title}</div>{group.items.map(([label, key]) => <button key={key} onClick={() => onOpenReport(key, { start: periodStart, end: periodEnd })} className="flex w-full items-center gap-3 border-t px-5 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-emerald-50 hover:text-emerald-800"><FileBarChart2 className="size-4 text-slate-400" /><span className="flex-1">{label}</span><ChevronRight className="size-4 text-slate-300" /></button>)}</div>)}</section>

      <aside className="space-y-4"><section className="rounded-xl border bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">VAT actions</h3><div className="mt-4 space-y-2"><VatAction icon={FileText} label="File VAT" description="Save this period as a filed return" disabled={!canWrite} onClick={() => { setFileReference(`VAT-${periodEnd.replaceAll("-", "")}`); setFileOpen(true); }} /><VatAction icon={SlidersHorizontal} label="Adjust VAT Due" description="Post a balanced VAT adjustment" disabled={!canWrite} onClick={() => { setAdjustment((old) => ({ ...old, reference: `VAT-ADJ-${Date.now().toString().slice(-7)}` })); setAdjustOpen(true); }} /><VatAction icon={History} label="Prior VAT Returns" description={`${returns.length} filed return${returns.length === 1 ? "" : "s"}`} onClick={() => document.getElementById("prior-vat-returns")?.scrollIntoView({ behavior: "smooth" })} /><VatAction icon={Percent} label="VAT Code List" description="Add and manage VAT codes" disabled={!canManageCodes} onClick={onManageCodes} /></div></section><section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" /><div><p className="text-sm font-bold text-amber-950">Review before filing</p><p className="mt-1 text-xs leading-5 text-amber-800">Check the unassigned and exception reports before saving a VAT return.</p></div></div></section></aside>
    </div>

    <section id="prior-vat-returns" className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="font-bold text-slate-900">Prior VAT returns</h3><p className="mt-1 text-sm text-slate-500">Filed period snapshots cannot be changed by later transactions.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Output VAT</TableHead><TableHead className="text-right">Input VAT</TableHead><TableHead className="text-right">Adjustments</TableHead><TableHead className="text-right">VAT due</TableHead></TableRow></TableHeader><TableBody>{returns.length ? returns.map((item) => <TableRow key={item.id}><TableCell>{item.periodStart} — {item.periodEnd}</TableCell><TableCell className="font-mono text-xs font-semibold">{item.reference}</TableCell><TableCell><Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="size-3" />Filed</Badge></TableCell><TableCell className="text-right">{money(item.outputVat, currency)}</TableCell><TableCell className="text-right">{money(item.inputVat, currency)}</TableCell><TableCell className="text-right">{money(item.adjustments, currency)}</TableCell><TableCell className="text-right font-bold">{money(item.netVatDue, currency)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-500">No VAT returns filed for this inventory.</TableCell></TableRow>}</TableBody></Table></div></section>

    {adjustments.length ? <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="font-bold text-slate-900">VAT adjustments</h3></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Reason</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{adjustments.map((item) => <TableRow key={item.id}><TableCell>{item.adjustmentDate}</TableCell><TableCell className="font-mono text-xs font-semibold">{item.reference}</TableCell><TableCell>{item.reason}</TableCell><TableCell><Badge variant="outline">{item.direction}</Badge></TableCell><TableCell className="text-right font-semibold">{money(item.amount, currency)}</TableCell></TableRow>)}</TableBody></Table></div></section> : null}

    <Dialog open={fileOpen} onOpenChange={setFileOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>File VAT return</DialogTitle><DialogDescription>This saves the current VAT totals as a permanent period snapshot.</DialogDescription></DialogHeader><form onSubmit={submitFile} className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Period start</Label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></div><div className="space-y-2"><Label>Period end</Label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></div></div><div className="space-y-2"><Label>Filing reference</Label><Input value={fileReference} onChange={(event) => setFileReference(event.target.value)} maxLength={80} required /></div><div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Net VAT due</span><strong>{money(summary.netVatDue, currency)}</strong></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setFileOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Filing…" : "File VAT"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Adjust VAT due</DialogTitle><DialogDescription>The adjustment posts to VAT Payable with an equal offset to Suspense.</DialogDescription></DialogHeader><form onSubmit={submitAdjustment} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Date</Label><Input type="date" value={adjustment.adjustmentDate} onChange={(event) => setAdjustment({ ...adjustment, adjustmentDate: event.target.value })} required /></div><div className="space-y-2"><Label>Reference</Label><Input value={adjustment.reference} onChange={(event) => setAdjustment({ ...adjustment, reference: event.target.value })} maxLength={80} required /></div><div className="space-y-2"><Label>Adjustment</Label><Select value={adjustment.direction} onValueChange={(direction) => setAdjustment({ ...adjustment, direction })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="increase">Increase VAT due</SelectItem><SelectItem value="decrease">Decrease VAT due</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Amount ({currency})</Label><Input type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} required /></div></div><div className="space-y-2"><Label>Reason</Label><Textarea value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} maxLength={500} rows={4} required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Posting…" : "Post adjustment"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function VatMetric({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) {
  return <div className={`rounded-xl border p-4 ${strong ? "border-emerald-200 bg-emerald-50" : "bg-slate-50"}`}><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-2 text-xl font-black ${strong ? "text-emerald-800" : "text-slate-900"}`}>{money(value, currency)}</p></div>;
}

function VatAction({ icon: Icon, label, description, onClick, disabled = false }: { icon: typeof Plus; label: string; description: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100"><Icon className="size-4 text-slate-600" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{label}</p><p className="text-xs text-slate-500">{description}</p></div><ChevronRight className="size-4 text-slate-300" /></button>;
}
