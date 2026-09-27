"use client";

import { useState } from "react";
import { Check, FileText, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inferUaeChequeLayout, uaeChequeLayout } from "@/lib/uae-cheque-layouts";

type RecordValue = string | number | boolean;
type ChequeRecord = Record<string, RecordValue> & { id: number };

function integerWords(value: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (value < 20) return ones[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  if (value < 1_000) return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${integerWords(value % 100)}` : ""}`;
  for (const [size, label] of [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]] as const) {
    if (value >= size) return `${integerWords(Math.floor(value / size))} ${label}${value % size ? ` ${integerWords(value % size)}` : ""}`;
  }
  return "Zero";
}

function amountInWords(amount: number, currency: string): string {
  const safe = Math.max(0, Math.round(amount * 100) / 100);
  const whole = Math.floor(safe);
  const fils = Math.round((safe - whole) * 100);
  const unit = currency === "AED" ? "UAE Dirham" : currency === "USD" ? "US Dollar" : currency === "EUR" ? "Euro" : currency;
  return `${integerWords(whole) || "Zero"} ${unit}${whole === 1 ? "" : "s"}${fils ? ` and ${integerWords(fils)} Fils` : ""} Only`;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

function escapeMarkup(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function printIsolatedDocument(title: string, styles: string, body: string) {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument;
  if (!printWindow || !printDocument) {
    frame.remove();
    return;
  }
  printDocument.open();
  printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeMarkup(title)}</title><style>${styles}</style></head><body>${body}</body></html>`);
  printDocument.close();
  let started = false;
  const startPrint = async () => {
    if (started) return;
    started = true;
    await printDocument.fonts?.ready;
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.isConnected && frame.remove(), 60_000);
  };
  if (printDocument.readyState === "complete") window.setTimeout(() => void startPrint(), 50);
  else frame.addEventListener("load", () => void startPrint(), { once: true });
}

function voucherPrintBody({ companyName, chequeNumber, bankName, layoutName, party, date, amount, currency, words, details, memo }: {
  companyName: string; chequeNumber: string; bankName: string; layoutName: string; party: string; date: string;
  amount: number; currency: string; words: string; details: string; memo: string;
}): string {
  return `<main class="voucher-page"><header><div><p class="company">${escapeMarkup(companyName)}</p><h1>CHEQUE PAYMENT VOUCHER</h1><p class="muted">${escapeMarkup(bankName)} · ${escapeMarkup(layoutName)}</p></div><div class="number"><span>CHEQUE NUMBER</span><strong>${escapeMarkup(chequeNumber)}</strong></div></header><section class="facts"><div><span>PAYEE</span><strong>${escapeMarkup(party)}</strong></div><div><span>CHEQUE DATE</span><strong>${escapeMarkup(date)}</strong></div><div><span>PAY FROM</span><strong>${escapeMarkup(bankName)}</strong></div><div><span>AMOUNT</span><strong>${escapeMarkup(money(amount, currency))}</strong></div></section><section class="words"><span>AMOUNT IN WORDS</span><strong>${escapeMarkup(words)}</strong></section><section class="details"><div><span>PAYMENT DETAILS</span><p>${escapeMarkup(details)}</p></div><div><span>MEMO / BILL REFERENCES</span><p>${escapeMarkup(memo || "—")}</p></div></section><footer><p>PREPARED BY</p><p>CHECKED BY</p><p>APPROVED BY</p></footer></main>`;
}

export function UaeBankCheque({ record, lines, journal, companyName, revision, canEditNumber = false, onNumberSaved }: { record: ChequeRecord; lines: ChequeRecord[]; journal: ChequeRecord[]; companyName: string; revision: string; canEditNumber?: boolean; onNumberSaved?: (number: string, revision: string) => void }) {
  const amount = Number(record.total || lines[0]?.total || 0);
  const currency = String(record.currency || "AED");
  const bankName = String(journal.find((line) => Number(line.credit) > 0)?.accountName || "Selected UAE bank account");
  const date = String(record.transactionDate || "");
  const selectedLayout = uaeChequeLayout(String(record.chequeBankKey || inferUaeChequeLayout(bankName)));
  const words = amountInWords(amount, currency);
  const [chequeNumber, setChequeNumber] = useState(String(record.number));
  const [numberDraft, setNumberDraft] = useState(String(record.number));
  const [editingNumber, setEditingNumber] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [numberError, setNumberError] = useState("");
  function printVoucher() {
    const styles = `@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:Arial,sans-serif}.voucher-page{width:190mm;min-height:277mm;padding:9mm;border:1px solid #cbd5e1;break-inside:avoid;page-break-inside:avoid}.voucher-page header{display:flex;justify-content:space-between;gap:12mm;padding-bottom:7mm;border-bottom:1px solid #cbd5e1}.company{margin:0;color:#047857;font-size:10pt;font-weight:800;letter-spacing:.18em}.voucher-page h1{margin:3mm 0 1mm;font-size:21pt}.muted{margin:0;color:#64748b;font-size:10pt}.number{text-align:right}.number span,.facts span,.words span,.details span{display:block;color:#64748b;font-size:8.5pt;font-weight:700;letter-spacing:.05em}.number strong{display:block;margin-top:2mm;font:700 13pt monospace}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm;margin-top:10mm}.facts strong{display:block;margin-top:2mm;font-size:10.5pt}.words{margin-top:9mm;padding:6mm;border:1px solid #cbd5e1;border-radius:3mm;background:#f8fafc}.words strong{display:block;margin-top:2mm;font-size:11pt;text-transform:uppercase}.details{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:9mm;padding-top:7mm;border-top:1px solid #cbd5e1}.details p{margin:2mm 0 0;font-size:10.5pt;white-space:pre-wrap}footer{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;margin-top:28mm;padding-top:12mm}footer p{margin:0;padding-top:3mm;border-top:1px solid #64748b;text-align:center;color:#64748b;font-size:8.5pt;font-weight:700}@media print{.voucher-page{break-after:avoid;page-break-after:avoid}}`;
    printIsolatedDocument(`Cheque voucher ${chequeNumber}`, styles, voucherPrintBody({ companyName, chequeNumber, bankName, layoutName: selectedLayout.name, party: String(record.party), date, amount, currency, words, details: String(lines[0]?.description || "Cheque payment"), memo: String(record.memo || "") }));
  }

  async function saveChequeNumber() {
    const number = numberDraft.trim();
    if (!number) return setNumberError("Enter the cheque number.");
    if (number.length > 100) return setNumberError("Cheque number must be no more than 100 characters.");
    setSavingNumber(true);
    setNumberError("");
    try {
      const response = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "transactions", id: record.id, companyId: Number(record.companyId), revision, editMode: "cheque-number", number }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the cheque number.");
      setChequeNumber(number);
      setNumberDraft(number);
      setEditingNumber(false);
      onNumberSaved?.(number, String(data.revision || ""));
    } catch (error) {
      setNumberError(error instanceof Error ? error.message : "Could not update the cheque number.");
    } finally {
      setSavingNumber(false);
    }
  }

  return <div className="uae-cheque-document space-y-5">
    <div className="document-internal-only space-y-4 rounded-xl border bg-slate-50 p-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-bold text-slate-900">UAE Bank Cheque</p><p className="text-sm text-slate-500">Saved cheque {chequeNumber}</p></div>
        <Button type="button" variant="outline" onClick={printVoucher}><FileText className="size-4" />Print A4 voucher</Button>
      </div>
      {canEditNumber && <div className="rounded-lg border bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1"><Label htmlFor="saved-cheque-number" className="text-xs">Cheque number</Label><Input id="saved-cheque-number" value={numberDraft} disabled={!editingNumber || savingNumber} maxLength={100} onChange={(event) => { setNumberDraft(event.target.value); setNumberError(""); }} /></div>
          {editingNumber ? <><Button type="button" size="sm" disabled={savingNumber} onClick={() => void saveChequeNumber()}><Check className="size-4" />{savingNumber ? "Saving…" : "Save number"}</Button><Button type="button" size="sm" variant="outline" disabled={savingNumber} onClick={() => { setNumberDraft(chequeNumber); setNumberError(""); setEditingNumber(false); }}><X className="size-4" />Cancel</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => setEditingNumber(true)}><Pencil className="size-4" />Edit cheque number</Button>}
        </div>
        {numberError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{numberError}</p>}
      </div>}
    </div>

    <section className="uae-cheque-sheet rounded-xl border-2 border-slate-300 bg-white p-7 text-slate-950 shadow-sm">
      <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">{companyName}</p><h2 className="mt-2 text-2xl font-black">CHEQUE PAYMENT VOUCHER</h2><p className="mt-1 text-sm text-slate-500">{bankName} · {selectedLayout.name}</p></div>
        <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cheque number</p><p className="mt-1 font-mono text-lg font-bold">{chequeNumber}</p></div>
      </div>
      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs uppercase text-slate-500">Payee</p><p className="mt-1 font-bold">{String(record.party)}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Cheque date</p><p className="mt-1 font-bold">{date}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Pay from</p><p className="mt-1 font-bold">{bankName}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Amount</p><p className="mt-1 font-bold">{money(amount, currency)}</p></div>
      </div>
      <div className="mt-6 rounded-lg border bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Amount in words</p><p className="mt-1 font-semibold uppercase">{words}</p></div>
      <div className="mt-6 grid gap-5 border-t pt-5 sm:grid-cols-2"><div><p className="text-xs uppercase text-slate-500">Payment details</p><p className="mt-1">{String(lines[0]?.description || "Cheque payment")}</p></div><div><p className="text-xs uppercase text-slate-500">Memo / bill references</p><p className="mt-1 whitespace-pre-wrap">{String(record.memo || "—")}</p></div></div>
      <div className="mt-8 grid grid-cols-3 gap-8 pt-8 text-center text-xs font-semibold text-slate-500"><p className="border-t pt-2">PREPARED BY</p><p className="border-t pt-2">CHECKED BY</p><p className="border-t pt-2">APPROVED BY</p></div>
    </section>
  </div>;
}
