"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Account = { id: number; code: string | number; name: string; type: string; active: boolean; currency: string };
type JournalLine = { id: number; accountName: string; debit: number; credit: number; originalDebit: number | null; originalCredit: number | null };
type JournalEntry = { currency: string | null; exchangeRate: number; id: number; entryDate: string; reference: string; description: string; transactionId: number | null; source: "Manual" | "Transaction" | "Stock revaluation" | "Automatic"; canManage: boolean; revision: string; debit: number; credit: number; lines: JournalLine[] };
type LineForm = { accountId: string; debit: string; credit: string };

const emptyLines = (): LineForm[] => [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export function JournalEntryCenter({ companyId, companyName, locationId, locationName, currency, exchangeRates, accounts, onPosted, onOpenSource }: { companyId: number; companyName: string; locationId: number; locationName: string; currency: string; exchangeRates: { currencyCode: string; rate: number }[]; accounts: Account[]; onPosted: () => Promise<void>; onOpenSource: (id: number) => void }) {
  const [entryCurrency, setEntryCurrency] = useState(currency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const currencyOptions = [...new Set([currency, entryCurrency, "AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD", "CHF", "SGD", "NZD", "PKR", "BDT", "LKR", "MYR", "THB", "IDR", "KRW", "TRY", "ZAR", ...exchangeRates.map((rate) => rate.currencyCode)])];
  const validRate = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0;
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineForm[]>(emptyLines());
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true })), [accounts]);
  const totals = useMemo(() => ({ debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0), credit: lines.reduce((sum, line) => sum + Number(line.credit || 0), 0) }), [lines]);
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.01;

  const loadEntries = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/journal-entries?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load journal entries");
      setEntries(data.entries);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load journal entries"); }
    finally { setLoading(false); }
  }, [companyId, locationId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEntries(); }, [loadEntries]);

  function openEditor() {
    setEditing(null);
    setEntryCurrency(currency); setExchangeRate("1");
    setEntryDate(today());
    setReference(`GJ-${Date.now().toString().slice(-8)}`);
    setDescription("");
    setLines(emptyLines());
    setEditorOpen(true);
  }

  function editEntry(entry: JournalEntry) {
    if (!entry.canManage) return;
    setEditing(entry);
    setEntryCurrency(entry.currency || currency); setExchangeRate(String(entry.exchangeRate || 1));
    setEntryDate(entry.entryDate); setReference(entry.reference); setDescription(entry.description);
    setLines(entry.lines.map((line) => ({ accountId: String(activeAccounts.find((account) => account.name === line.accountName)?.id ?? ""), debit: String(line.originalDebit ?? line.debit), credit: String(line.originalCredit ?? line.credit) })));
    setSelected(null); setEditorOpen(true);
  }

  async function deleteEntry() {
    if (!deleting) return;
    setSaving(true);
    try {
      const response = await fetch("/api/journal-entries", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleting.id, companyId, locationId, revision: deleting.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete journal");
      setDeleting(null); setSelected(null);
      await Promise.all([loadEntries(), onPosted()]);
      toast.success("Journal deleted; ledger balances updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete journal"); }
    finally { setSaving(false); }
  }

  function updateLine(index: number, change: Partial<LineForm>) {
    setLines((current) => current.map((line, position) => position === index ? { ...line, ...change } : line));
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!validRate) return toast.error("Enter a positive exchange rate.");
    if (!balanced) return toast.error("Total debits and credits must be equal.");
    setSaving(true);
    try {
      const response = await fetch("/api/journal-entries", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, locationId, entryDate, reference, description, lines, currency: entryCurrency, exchangeRate, ...(editing ? { id: editing.id, revision: editing.revision } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not post journal entry");
      setEditorOpen(false);
      await Promise.all([loadEntries(), onPosted()]);
      toast.success(`Journal ${reference} ${editing ? "updated" : "posted"}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not post journal entry"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <section className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><div className="brand-soft-icon grid size-11 place-items-center rounded-xl"><BookOpenCheck className="size-5" /></div><div><h2 className="font-bold text-slate-900">{companyName} journal</h2><p className="text-sm text-slate-500">Posting to {locationName} · ledger totals in {currency}</p></div></div>
      <Button onClick={openEditor} disabled={!activeAccounts.length || !locationId} className="brand-primary-button"><Plus className="size-4" />New journal entry</Button>
    </section>

    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4"><h3 className="font-bold text-slate-900">Posted journal entries</h3><p className="text-sm text-slate-500">Manual entries and automatic postings for the selected inventory.</p></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead>Entry currency</TableHead><TableHead className="text-right">Debit ({currency})</TableHead><TableHead className="text-right">Credit ({currency})</TableHead><TableHead className="w-56" /></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-500">Loading journal entries…</TableCell></TableRow> : entries.length ? entries.map((entry) => <TableRow key={entry.id}><TableCell className="whitespace-nowrap text-slate-500">{entry.entryDate}</TableCell><TableCell className="font-mono text-xs font-semibold">{entry.reference}</TableCell><TableCell className="max-w-md truncate">{entry.description}</TableCell><TableCell><Badge variant={entry.source === "Manual" ? "default" : "outline"}>{entry.source}</Badge></TableCell><TableCell><Badge variant="outline">{entry.currency || currency}</Badge></TableCell><TableCell className="text-right font-semibold">{money(entry.debit, currency)}</TableCell><TableCell className="text-right font-semibold">{money(entry.credit, currency)}</TableCell><TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => setSelected(entry)} aria-label={`Open journal ${entry.reference}`} title="View"><Eye className="size-4" /></Button>{entry.canManage ? <><Button variant="ghost" size="sm" onClick={() => editEntry(entry)}><Pencil className="size-4" />Edit</Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setDeleting(entry)} title="Delete" aria-label="Delete"><Trash2 className="size-4" /></Button></> : entry.transactionId ? <Button variant="ghost" size="sm" onClick={() => onOpenSource(entry.transactionId!)}>Open source</Button> : null}</div></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-500">No journal entries for this inventory.</TableCell></TableRow>}
      </TableBody></Table></div>
    </section>

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{editing ? "Edit general journal entry" : "New general journal entry"}</DialogTitle><DialogDescription>Every entry must contain equal debits and credits. It will post immediately to the ledger and financial reports.</DialogDescription></DialogHeader><form onSubmit={saveEntry} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="journal-currency">Entry currency *</Label><Select value={entryCurrency} onValueChange={(value) => { setEntryCurrency(value); setExchangeRate(value === currency ? "1" : String(exchangeRates.find((rate) => rate.currencyCode === value)?.rate ?? "")); }}><SelectTrigger id="journal-currency" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{currencyOptions.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="journal-exchange-rate">Exchange rate to {currency} *</Label><Input id="journal-exchange-rate" type="number" min="0.00000001" step="any" required readOnly={entryCurrency === currency} value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /><p className="text-xs text-slate-500">{validRate ? `1 ${entryCurrency} = ${exchangeRate} ${currency}` : "Enter a rate before posting."}</p></div></div>
      <div className="grid gap-4 md:grid-cols-[180px_220px_1fr]"><div className="space-y-2"><Label>Date *</Label><Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></div><div className="space-y-2"><Label>Reference *</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} required /></div><div className="space-y-2"><Label>Description *</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required className="min-h-9" placeholder="Reason for this journal entry" /></div></div>
      <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead className="min-w-72">Account</TableHead><TableHead className="min-w-40 text-right">Debit ({entryCurrency})</TableHead><TableHead className="min-w-40 text-right">Credit ({entryCurrency})</TableHead><TableHead className="w-14" /></TableRow></TableHeader><TableBody>{lines.map((line, index) => <TableRow key={index}><TableCell><Select value={line.accountId} onValueChange={(accountId) => updateLine(index, { accountId })}><SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.code} · {account.name} · {account.currency}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input type="number" min="0" step="0.01" value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value, ...(Number(event.target.value) > 0 ? { credit: "" } : {}) })} className="text-right" placeholder="0.00" /></TableCell><TableCell><Input type="number" min="0" step="0.01" value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value, ...(Number(event.target.value) > 0 ? { debit: "" } : {}) })} className="text-right" placeholder="0.00" /></TableCell><TableCell><Button type="button" variant="ghost" size="icon" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, position) => position !== index))} aria-label="Remove journal line" className="text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="size-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { accountId: "", debit: "", credit: "" }])}><Plus className="size-4" />Add line</Button><div className="flex flex-wrap items-center gap-5 text-sm"><span>Debit <strong className="ml-2">{money(totals.debit, entryCurrency)}</strong></span><span>Credit <strong className="ml-2">{money(totals.credit, entryCurrency)}</strong></span><Badge className={balanced ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>{balanced ? "Balanced" : `Difference ${money(Math.abs(totals.debit - totals.credit), entryCurrency)}`}</Badge></div></div>
      <p className="text-sm text-slate-500">Home-currency total: {validRate ? money(Math.round(totals.debit * Number(exchangeRate) * 100) / 100, currency) : "—"}. Changing currency keeps the entered amounts; the exchange rate converts the ledger postings.</p>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !balanced || !validRate} className="brand-primary-button">{saving ? "Saving…" : editing ? "Save changes" : "Post journal entry"}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete journal {deleting?.reference}?</DialogTitle><DialogDescription>This removes its debit and credit postings from the ledger and financial reports. The change is recorded in the audit history.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={deleteEntry}>{saving ? "Deleting…" : "Delete journal"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{selected?.reference}</DialogTitle><DialogDescription>{selected?.entryDate} · {selected?.description} · {selected?.currency || currency} · Rate {selected?.exchangeRate || 1} to {currency}</DialogDescription></DialogHeader><div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{selected?.lines.map((line) => <TableRow key={line.id}><TableCell className="font-medium">{line.accountName}</TableCell><TableCell className="text-right">{(line.originalDebit ?? line.debit) ? money(line.originalDebit ?? line.debit, selected?.currency || currency) : "—"}</TableCell><TableCell className="text-right">{(line.originalCredit ?? line.credit) ? money(line.originalCredit ?? line.credit, selected?.currency || currency) : "—"}</TableCell></TableRow>)}</TableBody></Table></div><DialogFooter><div className="mr-auto text-sm font-semibold">Home-currency total: {money(selected?.debit ?? 0, currency)}</div><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
