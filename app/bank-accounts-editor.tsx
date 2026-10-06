"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { draftBankAccounts, MAX_BANK_ACCOUNTS, type BankAccount } from "@/lib/bank-accounts";

const fields: { key: keyof Omit<BankAccount, "id" | "currency">; label: string; max: number }[] = [
  { key: "bankName", label: "Bank Name", max: 120 }, { key: "accountName", label: "Account Name", max: 120 },
  { key: "accountNumber", label: "Account Number", max: 80 }, { key: "iban", label: "IBAN", max: 80 }, { key: "swift", label: "SWIFT / BIC", max: 40 },
];

const newBankId = () => `bank-${Math.random().toString(36).slice(2, 10)}`;

/** Extra company bank accounts, one per currency; documents print the account matching their currency. */
export function BankAccountsEditor({ value, defaultCurrency, onChange, disabled }: { value: string; defaultCurrency: string; onChange: (value: string) => void; disabled?: boolean }) {
  const accounts = draftBankAccounts(value);
  const save = (next: BankAccount[]) => onChange(JSON.stringify(next));
  const update = (id: string, patch: Partial<BankAccount>) => save(accounts.map((account) => account.id === id ? { ...account, ...patch } : account));
  const used = new Set([defaultCurrency.toUpperCase(), ...accounts.map((account) => account.currency)]);
  const nextCurrency = ["USD", "EUR", "GBP", "SAR", "AED", "INR", "OMR", "QAR", "KWD", "BHD"].find((code) => !used.has(code)) ?? "";
  return <div className="mt-5 grid gap-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Bank accounts by currency</h3><p className="text-sm text-slate-500">Documents show the account matching their currency. The account above ({defaultCurrency || "default"}) is used when no currency matches.</p></div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || accounts.length >= MAX_BANK_ACCOUNTS} onClick={() => save([...accounts, { id: newBankId(), currency: nextCurrency, bankName: "", accountName: "", accountNumber: "", iban: "", swift: "" }])}><Plus className="size-4" />Add currency account</Button>
    </div>
    {accounts.map((account) => <div key={account.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[6rem_repeat(5,minmax(0,1fr))_auto] md:items-end">
      <div className="space-y-1"><Label htmlFor={`${account.id}-currency`}>Currency</Label><Input id={`${account.id}-currency`} value={account.currency} maxLength={3} disabled={disabled} className="uppercase" aria-invalid={!/^[A-Z]{3}$/.test(account.currency) || accounts.filter((entry) => entry.currency === account.currency).length > 1} onChange={(event) => update(account.id, { currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></div>
      {fields.map((field) => <div key={field.key} className="min-w-0 space-y-1"><Label htmlFor={`${account.id}-${field.key}`}>{field.label}</Label><Input id={`${account.id}-${field.key}`} value={account[field.key]} maxLength={field.max} disabled={disabled} onChange={(event) => update(account.id, { [field.key]: event.target.value })} /></div>)}
      <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${account.currency || "currency"} bank account`} disabled={disabled} onClick={() => save(accounts.filter((entry) => entry.id !== account.id))}><Trash2 className="size-4" /></Button>
    </div>)}
  </div>;
}
