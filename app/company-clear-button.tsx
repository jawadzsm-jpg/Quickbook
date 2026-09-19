"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export function CompanyClearButton({ companyId, companyName, disabled }: { companyId: number; companyName: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"" | "setup" | "all">("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const changeOpen = (next: boolean) => { if (busy) return; setOpen(next); setPassword(""); setConfirmed(false); setScope(""); };
  const clear = async () => {
    if (!scope || !password || !confirmed || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/company-setup/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, scope, password, confirmation: companyName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not clear company.");
      toast.success(scope === "all" ? "Company data cleared" : "Company setup cleared");
      window.location.reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not clear company."); }
    finally { setPassword(""); setBusy(false); }
  };
  return <section className="col-span-full rounded-xl border border-red-300 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold">Clear company</h2><p className="text-sm text-muted-foreground">Only the Administrator assigned to ${companyName} can clear this company. All-Admin is not allowed. Your current password is required.</p></div><Button type="button" variant="destructive" disabled={disabled || !companyId} onClick={() => changeOpen(true)}>Clear</Button></div><Dialog open={open} onOpenChange={changeOpen}><DialogContent onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} onInteractOutside={e => e.preventDefault()}><DialogHeader><DialogTitle>Clear {companyName}</DialogTitle><DialogDescription>Select what to clear from this company. This cannot be undone in the app.</DialogDescription></DialogHeader><fieldset disabled={busy} className="grid gap-4"><label className="grid gap-2 text-sm">Clear option<select className="rounded-md border bg-background p-2" value={scope} onChange={e => { setScope(e.target.value as typeof scope); setConfirmed(false); setPassword(""); }}><option value="">Choose an option</option><option value="setup">Company setup and logos only</option><option value="all">All company business data and setup</option></select></label>{scope && <><p className="text-sm">{scope === "setup" ? "Clears logos, stamp, address, contact details, bank display details and template settings. Transactions, items and accounts are retained." : "Deletes transactions, payments, journals, customers, vendors, items, accounts, active inventories, attachments, saved reports, VAT records, exchange rates and company settings. Cross-company stock-transfer history is retained, and any linked historical inventory location is kept inactive."} Company name, base currency, users and audit history are retained.</p><label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>I confirm I want to clear <strong>{companyName}</strong>. This action cannot be undone.</span></label><label className="grid gap-2 text-sm">Your administrator password<Input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label></>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button><Button type="button" variant="destructive" disabled={!scope || !password || !confirmed || busy} onClick={() => void clear()}>{busy ? "Clearing…" : scope === "all" ? "Clear all company data" : "Clear setup"}</Button></div></fieldset></DialogContent></Dialog></section>;
}
