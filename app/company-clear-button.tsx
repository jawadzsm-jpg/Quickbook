"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CLEAR_GROUPS, CLEAR_SECTIONS, clearTotal, toggleClearSection, type ClearCounts, type ClearSection } from "@/lib/company-clear";

const number = (value: number) => value.toLocaleString("en-AE");

export function CompanyClearButton({ companyId, companyName, disabled }: { companyId: number; companyName: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<ClearSection[]>([]);
  const [counts, setCounts] = useState<ClearCounts | null>(null);
  const [countError, setCountError] = useState("");
  const [typedName, setTypedName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const changeOpen = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setPassword("");
    setTypedName("");
    setConfirmed(false);
    setSections([]);
  };
  // Opening the dialog loads how many records each option would clear.
  useEffect(() => {
    if (!open || !companyId) return;
    let active = true;
    fetch(`/api/company-setup/clear?companyId=${companyId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not count the company data.");
      if (active) { setCounts(data.counts); setCountError(""); }
    }).catch((error) => { if (active) setCountError(error instanceof Error ? error.message : "Could not count the company data."); });
    return () => { active = false; };
  }, [open, companyId]);
  const toggleSection = (section: ClearSection, checked: boolean) => { setSections((current) => toggleClearSection(current, section, checked)); setConfirmed(false); };
  const nameMatches = typedName.trim() === companyName;
  const ready = sections.length > 0 && Boolean(password) && confirmed && nameMatches && !busy;
  const selectedTotal = counts ? sections.reduce((sum, section) => sum + clearTotal(counts, section), 0) : 0;
  const clear = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const response = await fetch("/api/company-setup/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, sections, password, confirmation: typedName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not clear company.");
      toast.success("Selected company data cleared");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear company.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  };
  return <section className="col-span-full rounded-xl border border-destructive/40 bg-destructive/5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="font-bold">Clear company</h2>
        <p className="text-sm text-muted-foreground">Only the Administrator assigned to {companyName} can clear this company. All-Admin is not allowed. The Chart of Accounts and items are always kept.</p>
      </div>
      <Button type="button" variant="destructive" disabled={disabled || !companyId} onClick={() => changeOpen(true)}>Clear</Button>
    </div>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Clear {companyName}</DialogTitle>
          <DialogDescription>Tick only the data you want to clear. The number of records each option removes is shown next to it.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{countError ? <span className="text-rose-600">{countError}</span> : counts ? null : "Counting records…"}</span>
            <span className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setSections(CLEAR_SECTIONS.map((section) => section.id)); setConfirmed(false); }}>Select all</Button><Button type="button" size="sm" variant="ghost" disabled={!sections.length} onClick={() => { setSections([]); setConfirmed(false); }}>Clear selection</Button></span>
          </div>
          {CLEAR_GROUPS.map((group) => <div key={group.id} className="grid gap-2" role="group" aria-label={group.label}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
            {CLEAR_SECTIONS.filter((option) => option.group === group.id).map((option) => {
              const parts = counts?.[option.id];
              const total = counts ? clearTotal(counts, option.id) : 0;
              const checked = sections.includes(option.id);
              return <label key={option.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${checked ? "border-destructive/60 bg-destructive/5" : ""}`}>
                <Checkbox checked={checked} onCheckedChange={(value) => toggleSection(option.id, value === true)} aria-label={option.label} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><strong>{option.label}</strong>{parts ? <Badge variant={total ? "secondary" : "outline"} className="font-normal">{total ? `${number(total)} ${total === 1 ? "record" : "records"}` : "Nothing to clear"}</Badge> : null}{"requires" in option ? <span className="text-xs text-muted-foreground">with Transactions</span> : null}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span>
                  {parts && total ? <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">{parts.filter((part) => part.count).map((part) => <span key={part.label}><span className="text-muted-foreground">{part.label}</span> <span className="font-semibold tabular-nums">{number(part.count)}</span></span>)}</span> : null}
                </span>
              </label>;
            })}
          </div>)}
          <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span><strong>Always kept:</strong> the Chart of Accounts and every sub-account, every item with its inventory location and warehouses, the company name and base currency, users and their access, and the audit history. Clearing transactions only resets balances to zero.</span></div>
          {sections.length ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            <p className="font-semibold">You are about to clear{counts ? ` ${number(selectedTotal)} ${selectedTotal === 1 ? "record" : "records"}` : ""}:</p>
            <ul className="mt-1 list-inside list-disc text-xs">{sections.map((section) => { const option = CLEAR_SECTIONS.find((entry) => entry.id === section)!; const total = counts ? clearTotal(counts, section) : null; return <li key={section}>{option.label}{total !== null && counts?.[section] ? ` — ${number(total)}` : ""}</li>; })}</ul>
            <p className="mt-2 text-xs">This cannot be undone. Make a company backup first (Admin Controls → Backups) if you may need this data again.</p>
          </div> : null}
          <label className="grid gap-2 text-sm">Type the company name <strong className="font-mono">{companyName}</strong> to confirm<Input value={typedName} autoComplete="off" onChange={(event) => setTypedName(event.target.value)} aria-invalid={Boolean(typedName) && !nameMatches} />{typedName && !nameMatches ? <span className="text-xs text-rose-600">The name does not match.</span> : null}</label>
          <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
            <span>I confirm I want to permanently clear the selected data from <strong>{companyName}</strong>.</span>
          </label>
          <label className="grid gap-2 text-sm">Your administrator password<Input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={!ready} onClick={() => void clear()}>{busy ? "Clearing…" : sections.length ? `Clear ${sections.length} selected` : "Clear selected"}</Button>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  </section>;
}
