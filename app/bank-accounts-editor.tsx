"use client";

import { ImageUp, Plus, Stamp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { draftBankAccounts, MAX_BANK_ACCOUNTS, validBankStamp, type BankAccount } from "@/lib/bank-accounts";

const fields: { key: keyof Omit<BankAccount, "id" | "currency" | "stampData">; label: string; max: number }[] = [
  { key: "bankName", label: "Bank Name", max: 120 }, { key: "accountName", label: "Account Name", max: 120 },
  { key: "accountNumber", label: "Account Number", max: 80 }, { key: "iban", label: "IBAN", max: 80 }, { key: "swift", label: "SWIFT / BIC", max: 40 },
];

/** Upload, preview and remove the stamp printed with one bank account's details. */
export function BankStampPicker({ id, currency, value, onChange, disabled }: { id: string; currency: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const choose = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500_000) return toast.error("Upload a PNG, JPG or WebP bank stamp smaller than 500 KB.");
    const reader = new FileReader();
    reader.onload = () => { const data = String(reader.result ?? ""); if (validBankStamp(data)) onChange(data); else toast.error("Upload a PNG, JPG or WebP bank stamp smaller than 500 KB."); };
    reader.onerror = () => toast.error("Could not read the selected bank stamp.");
    reader.readAsDataURL(file);
  };
  return <div className="flex flex-wrap items-center gap-3">
    {/* eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview */}
    {value ? <img src={value} alt={`${currency || "Bank"} bank stamp preview`} className="h-14 w-20 rounded-md border bg-white object-contain p-1" /> : <div className="grid h-14 w-20 place-items-center rounded-md bg-slate-100 text-slate-400"><Stamp className="size-5" /></div>}
    <label htmlFor={`${id}-stamp`} className={`inline-flex h-8 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-slate-50"}`}><ImageUp className="size-4" />{value ? "Change" : "Choose"} {currency ? `${currency} ` : ""}bank stamp<input id={`${id}-stamp`} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {value ? <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange("")}>Remove</Button> : null}
    <span className="text-xs text-slate-500">PNG, JPG or WebP · max 500 KB · printed with this account&apos;s details</span>
  </div>;
}

// Row IDs come from the secure random generator (CodeQL blocks Math.random() in values sent to the API).
const newBankId = () => `bank-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

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
      <div className="md:col-span-full"><BankStampPicker id={account.id} currency={account.currency} value={account.stampData ?? ""} disabled={disabled} onChange={(stampData) => update(account.id, stampData ? { stampData } : { stampData: undefined })} /></div>
    </div>)}
  </div>;
}
