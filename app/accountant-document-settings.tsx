"use client";
import { useState } from "react";
import { Minus, Maximize2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BankAccountsEditor, BankStampPicker } from "./bank-accounts-editor";
type Settings = { id: number; bankName: string; bankAccountName: string; bankAccountNumber: string; bankIban: string; bankSwift: string; bankCurrency: string; stampData: string; bankStampData: string; bankAccounts: string };
export function AccountantDocumentSettings({ setup, onSaved }: { setup: Settings; onSaved: () => void }) {
  const [form, setForm] = useState(setup), [saving, setSaving] = useState(false), [minimized, setMinimized] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const { bankName, bankAccountName, bankAccountNumber, bankIban, bankSwift, bankCurrency, stampData, bankStampData } = form;
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: setup.id, bankName, bankAccountName, bankAccountNumber, bankIban, bankSwift, bankCurrency, stampData, bankStampData, bankAccounts: form.bankAccounts || "[]" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success("Bank details and stamps saved."); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save."); }
    finally { setSaving(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Document stamp &amp; bank details</h2><Button variant="outline" onClick={() => setMinimized(!minimized)}>{minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}{minimized ? "Restore" : "Minimize"}</Button></div>
    {!minimized && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(["bankName", "bankAccountName", "bankAccountNumber", "bankIban", "bankSwift", "bankCurrency"] as const).map(key => <label key={key} className="min-w-0 space-y-1 text-sm"><span>{{ bankName: "Bank name", bankAccountName: "Account name", bankAccountNumber: "Account number", bankIban: "IBAN", bankSwift: "SWIFT", bankCurrency: "Currency" }[key]}</span><Input disabled={saving} value={form[key]} maxLength={key === "bankCurrency" ? 3 : 120} onChange={e => setForm({ ...form, [key]: ["bankIban", "bankSwift", "bankCurrency"].includes(key) ? e.target.value.toUpperCase() : e.target.value })} /></label>)}</div>
    <div className="space-y-1 text-sm"><span>Bank stamp ({form.bankCurrency || "default account"})</span><BankStampPicker id="accountant-default-bank" currency={form.bankCurrency} value={form.bankStampData} disabled={saving} onChange={bankStampData => setForm(current => ({ ...current, bankStampData }))} /></div>
    <BankAccountsEditor value={form.bankAccounts} defaultCurrency={form.bankCurrency} disabled={saving} onChange={bankAccounts => setForm(current => ({ ...current, bankAccounts }))} />
    <label className="block space-y-1 text-sm"><span>Company stamp (PNG, JPG or WebP, up to 500 KB)</span><Input type="file" disabled={saving} accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 500000 || !["image/png","image/jpeg","image/webp"].includes(file.type)) { toast.error("Choose a supported image up to 500 KB."); return; } const reader = new FileReader(); reader.onload = () => setForm(current => ({ ...current, stampData: String(reader.result) })); reader.readAsDataURL(file); }} /></label>
    {form.stampData && <p className="text-sm text-muted-foreground">Company stamp selected for document output.</p>}<Button disabled={saving} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save stamps and bank details"}</Button></>}
  </section>;
}
