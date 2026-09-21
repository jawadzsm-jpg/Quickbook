"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const clearOptions = [
  { id: "transactions", label: "Transactions, payments and cheques", detail: "Clears sales, purchases, banking transactions, allocations, journal entries, VAT transaction history and internal stock-transfer history." },
  { id: "inventory", label: "Items and inventory data", detail: "Clears items, stock movements, inventory checks and active inventory locations. Locations required by cross-company transfers are retained as inactive." },
  { id: "contacts", label: "Customers, vendors and employees", detail: "Clears contact records and employee attachments." },
  { id: "reports", label: "Saved reports and attachments", detail: "Clears memorised reports, inventory-check reports and remaining record attachments." },
  { id: "settings", label: "VAT, currencies and company controls", detail: "Clears VAT codes, exchange rates and company-level control settings." },
  { id: "setup", label: "Company setup and templates", detail: "Clears logos, stamp, address, contact details, bank display details and document-template settings." },
] as const;

type ClearSection = typeof clearOptions[number]["id"];

export function CompanyClearButton({ companyId, companyName, disabled }: { companyId: number; companyName: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<ClearSection[]>(["transactions"]);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const changeOpen = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setPassword("");
    setConfirmed(false);
    setSections(["transactions"]);
  };
  const toggleSection = (section: ClearSection, checked: boolean) => {
    setSections((current) => checked ? [...new Set([...current, section])] : current.filter((value) => value !== section));
    setConfirmed(false);
  };
  const clear = async () => {
    if (!sections.length || !password || !confirmed || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/company-setup/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, sections, password, confirmation: companyName }),
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
  return <section className="col-span-full rounded-xl border border-red-300 p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="font-bold">Clear company</h2>
        <p className="text-sm text-muted-foreground">Only the Administrator assigned to {companyName} can clear this company. All-Admin is not allowed. The Chart of Accounts is always kept.</p>
      </div>
      <Button type="button" variant="destructive" disabled={disabled || !companyId} onClick={() => changeOpen(true)}>Clear</Button>
    </div>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Clear {companyName}</DialogTitle>
          <DialogDescription>Select only the data you want to clear. The Chart of Accounts, company identity, base currency, user access and audit history are always retained.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="grid gap-4">
          <div className="grid gap-2" role="group" aria-label="Company data to clear">
            {clearOptions.map((option) => <label key={option.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <Checkbox checked={sections.includes(option.id)} onCheckedChange={(checked) => toggleSection(option.id, checked === true)} />
              <span><strong className="block">{option.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span></span>
            </label>)}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Always kept:</strong> the complete Chart of Accounts. If transaction history is cleared, account and contact balances are reset to zero.</div>
          <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
            <span>I confirm I want to permanently clear the selected data from <strong>{companyName}</strong>.</span>
          </label>
          <label className="grid gap-2 text-sm">Your administrator password<Input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={!sections.length || !password || !confirmed || busy} onClick={() => void clear()}>{busy ? "Clearing…" : "Clear selected data"}</Button>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  </section>;
}
