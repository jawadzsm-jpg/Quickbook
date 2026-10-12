"use client";

import { FormEvent, useMemo, useState } from "react";
import { BookOpenCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountHistory } from "./account-history";
import { PostedJournalList, JournalAccountLines } from "./posted-journal-list";
import type { JournalEntry, JournalLine } from "@/lib/journal-register";
import { Textarea } from "@/components/ui/textarea";

type Account = { id: number; code: string | number; name: string; type: string; active: boolean; currency: string };
type LineForm = { accountId: string; debit: string; credit: string };

const emptyLines = (): LineForm[] => [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export function JournalEntryCenter({ companyId, companyName, locationId, locationName, currency, exchangeRates, accounts, stampData, onPosted, onOpenSource }: { companyId: number; companyName: string; locationId: number; locationName: string; currency: string; exchangeRates: { currencyCode: string; rate: number }[]; accounts: Account[]; stampData: string; onPosted: () => Promise<void>; onOpenSource: (id: number) => void }) {
  const [entryCurrency, setEntryCurrency] = useState(currency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const currencyOptions = [...new Set([currency, entryCurrency, "AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD", "CHF", "SGD", "NZD", "PKR", "BDT", "LKR", "MYR", "THB", "IDR", "KRW", "TRY", "ZAR", ...exchangeRates.map((rate) => rate.currencyCode)])];
  const validRate = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0;
  const [refreshKey, setRefreshKey] = useState(0);
  const [linkedAccount, setLinkedAccount] = useState<JournalLine | null>(null);
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

  async function loadEntries() { setRefreshKey(value => value + 1); }

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
    setLines(entry.lines.map((line) => {
      const account = activeAccounts.find((candidate) => candidate.id === line.accountId);
      return { accountId: String(account?.id ?? ""), debit: String(line.originalDebit ?? line.debit), credit: String(line.originalCredit ?? line.credit) };
    }));
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card text-card-foreground p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><div className="brand-soft-icon grid size-11 place-items-center rounded-xl"><BookOpenCheck className="size-5" /></div><div><h2 className="font-bold text-foreground">{companyName} journal</h2><p className="text-sm text-muted-foreground">Posting to {locationName} · ledger totals in {currency}</p></div></div>
      <Button onClick={openEditor} disabled={!activeAccounts.length || !locationId} className="brand-primary-button"><Plus className="size-4" />New journal entry</Button>
    </section>

    <PostedJournalList companyId={companyId} companyName={companyName} locationId={locationId} locationName={locationName} currency={currency} stampData={stampData} refreshKey={refreshKey} onView={setSelected} onEdit={editEntry} onDelete={setDeleting} onOpenSource={onOpenSource} onAccount={setLinkedAccount} />

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-h-[92vh] overflow-y-auto [--dialog-width:64rem] sm:max-w-6xl"><DialogHeader><DialogTitle>{editing ? "Edit general journal entry" : "New general journal entry"}</DialogTitle><DialogDescription>Every entry must contain equal debits and credits. It will post immediately to the ledger and financial reports.</DialogDescription></DialogHeader><form onSubmit={saveEntry} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="journal-currency">Entry currency *</Label><Select value={entryCurrency} onValueChange={(value) => { setEntryCurrency(value); setExchangeRate(value === currency ? "1" : String(exchangeRates.find((rate) => rate.currencyCode === value)?.rate ?? "")); }}><SelectTrigger id="journal-currency" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{currencyOptions.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="journal-exchange-rate">Exchange rate to {currency} *</Label><Input id="journal-exchange-rate" type="number" min="0.00000001" step="any" required readOnly={entryCurrency === currency} value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /><p className="text-xs text-muted-foreground">{validRate ? `1 ${entryCurrency} = ${exchangeRate} ${currency}` : "Enter a rate before posting."}</p></div></div>
      <div className="grid gap-4 md:grid-cols-[180px_220px_1fr]"><div className="space-y-2"><Label>Date *</Label><Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></div><div className="space-y-2"><Label>Reference *</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} required /></div><div className="space-y-2"><Label>Description *</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required className="min-h-9" placeholder="Reason for this journal entry" /></div></div>
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Lines</p><Button type="button" variant="outline" onClick={() => setLines((current) => [{ accountId: "", debit: "", credit: "" }, ...current])}><Plus className="size-4" />Add line</Button></div>
      <div className="space-y-3">{lines.map((line,index)=><div key={index} className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="grid min-w-0 gap-1 text-sm sm:col-span-2 lg:col-span-1">Account<Select value={line.accountId} onValueChange={accountId=>updateLine(index,{accountId})}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Select account"/></SelectTrigger><SelectContent>{activeAccounts.map(account=><SelectItem key={account.id} value={String(account.id)}>{account.code} · {account.name} · {account.currency}</SelectItem>)}</SelectContent></Select></label><label className="grid min-w-0 gap-1 text-sm">Debit ({entryCurrency})<Input type="number" min="0" step="0.01" value={line.debit} onChange={event=>updateLine(index,{debit:event.target.value,...(Number(event.target.value)>0?{credit:""}:{})})} className="min-w-0 text-right tabular-nums" placeholder="0.00"/></label><label className="grid min-w-0 gap-1 text-sm">Credit ({entryCurrency})<Input type="number" min="0" step="0.01" value={line.credit} onChange={event=>updateLine(index,{credit:event.target.value,...(Number(event.target.value)>0?{debit:""}:{})})} className="min-w-0 text-right tabular-nums" placeholder="0.00"/></label><Button type="button" variant="ghost" size="icon" disabled={lines.length<=2} onClick={()=>setLines(current=>current.filter((_,position)=>position!==index))} aria-label={`Remove journal line ${index+1}`} className="self-end text-rose-600 dark:text-rose-400" title="Delete"><Trash2 className="size-4"/></Button></div>)}</div>
      <div className="flex flex-col gap-4 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-5 text-sm"><span>Debit <strong className="ml-2">{money(totals.debit, entryCurrency)}</strong></span><span>Credit <strong className="ml-2">{money(totals.credit, entryCurrency)}</strong></span><Badge className={balanced ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}>{balanced ? "Balanced" : `Difference ${money(Math.abs(totals.debit - totals.credit), entryCurrency)}`}</Badge></div></div>
      <p className="text-sm text-muted-foreground">Home-currency total: {validRate ? money(Math.round(totals.debit * Number(exchangeRate) * 100) / 100, currency) : "—"}. Changing currency keeps the entered amounts; the exchange rate converts the ledger postings.</p>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !balanced || !validRate} className="brand-primary-button">{saving ? "Saving…" : editing ? "Save changes" : "Post journal entry"}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete journal {deleting?.reference}?</DialogTitle><DialogDescription>This removes its debit and credit postings from the ledger and financial reports. The change is recorded in the audit history.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={deleteEntry}>{saving ? "Deleting…" : "Delete journal"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto [--dialog-width:56rem] sm:max-w-4xl"><DialogHeader><DialogTitle>{selected?.reference}</DialogTitle><DialogDescription>{selected?.entryDate} · {selected?.description} · Entry currency {selected?.currency || currency} · Rate {selected?.exchangeRate || 1} to {currency}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">Posted amounts below are in {currency}. Select an account to open its ledger history.</p><JournalAccountLines lines={selected?.lines || []} currency={currency} onAccount={setLinkedAccount}/>{selected?.currency && selected.currency !== currency && <p className="text-sm text-muted-foreground">Original entry totals: Debit {money(selected.lines.reduce((n,line)=>n+(line.originalDebit ?? line.debit/selected.exchangeRate),0),selected.currency)} · Credit {money(selected.lines.reduce((n,line)=>n+(line.originalCredit ?? line.credit/selected.exchangeRate),0),selected.currency)}</p>}<DialogFooter><div className="mr-auto text-sm font-semibold">Home-currency total: {money(selected?.debit ?? 0, currency)}</div>{selected?.transactionId&&<Button variant="outline" onClick={()=>{onOpenSource(selected.transactionId!);setSelected(null);}}>Open source</Button>}<Button variant="outline" onClick={()=>setSelected(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(linkedAccount)} onOpenChange={open=>{if(!open)setLinkedAccount(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto [--dialog-width:64rem] sm:max-w-5xl"><DialogHeader><DialogTitle>{linkedAccount?.accountCode} · {linkedAccount?.accountName}</DialogTitle><DialogDescription>Chart of Accounts ledger history · {companyName}</DialogDescription></DialogHeader>{linkedAccount?.accountId&&<AccountHistory key={linkedAccount.accountId} accountId={linkedAccount.accountId} companyId={companyId} onOpen={id=>{setLinkedAccount(null);setSelected(null);onOpenSource(id);}}/>}</DialogContent></Dialog>
  </div>;
}
