"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function UaeBankCheque({ record, lines, journal, companyName }: { record: ChequeRecord; lines: ChequeRecord[]; journal: ChequeRecord[]; companyName: string }) {
  const amount = Number(record.total || lines[0]?.total || 0);
  const currency = String(record.currency || "AED");
  const bankName = String(journal.find((line) => Number(line.credit) > 0)?.accountName || "Selected UAE bank account");
  const date = String(record.transactionDate || "");
  const dateDigits = date ? date.split("-").reverse().join("").split("") : [];
  const crossed = String(record.terms || "account-payee") !== "bearer";

  return <div className="space-y-5">
    <div className="document-internal-only flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4 print:hidden">
      <div><p className="font-bold text-slate-900">UAE Bank Cheque</p><p className="text-sm text-slate-500">Saved cheque and payment voucher · {String(record.number)}</p></div>
      <Button type="button" onClick={() => window.print()}><Printer className="size-4" />Print cheque · A4</Button>
    </div>

    <section className="uae-cheque-sheet rounded-xl border-2 border-slate-300 bg-white p-7 text-slate-950 shadow-sm">
      <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">{companyName}</p><h2 className="mt-2 text-2xl font-black">UAE BANK CHEQUE</h2><p className="mt-1 text-sm text-slate-500">{bankName}</p></div>
        <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cheque number</p><p className="mt-1 font-mono text-lg font-bold">{String(record.number)}</p></div>
      </div>

      <div className="relative mt-6 min-h-[290px] rounded-lg border-2 border-slate-400 p-6">
        {crossed && <div className="absolute left-6 top-5 -rotate-6 border-y-2 border-slate-800 px-4 py-1 text-xs font-black tracking-widest">A/C PAYEE ONLY</div>}
        <div className="ml-auto w-fit"><p className="mb-1 text-right text-[10px] font-bold tracking-[.3em] text-slate-500">DDMMYYYY</p><div className="flex">{Array.from({ length: 8 }, (_, index) => <span key={index} className="grid size-8 place-items-center border border-slate-500 font-mono font-bold">{dateDigits[index] || ""}</span>)}</div></div>
        <div className="mt-12 grid grid-cols-[140px_1fr] items-end gap-3"><span className="text-sm font-semibold">Pay to the order of</span><p className="border-b-2 border-slate-500 pb-1 text-lg font-bold uppercase">{String(record.party)}</p></div>
        <div className="mt-7 grid grid-cols-[140px_1fr] items-end gap-3"><span className="text-sm font-semibold">Amount in words</span><p className="border-b-2 border-slate-500 pb-1 font-semibold uppercase leading-7">*** {amountInWords(amount, currency)} ***</p></div>
        <div className="mt-7 flex items-end justify-between gap-6"><p className="text-sm text-slate-500">{crossed ? "Crossed cheque · Account payee only" : "Bearer cheque"}</p><div className="flex min-w-64 items-center border-2 border-slate-700"><span className="border-r-2 border-slate-700 bg-slate-100 px-4 py-3 font-black">{currency}</span><span className="flex-1 px-4 py-3 text-right text-xl font-black">{amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div>
        <div className="mt-9 flex justify-end"><p className="w-64 border-t border-slate-500 pt-2 text-center text-xs font-semibold text-slate-500">AUTHORIZED SIGNATURE</p></div>
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs uppercase text-slate-500">Payee</p><p className="mt-1 font-bold">{String(record.party)}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Cheque date</p><p className="mt-1 font-bold">{date}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Bank account</p><p className="mt-1 font-bold">{bankName}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Amount</p><p className="mt-1 font-bold">{money(amount, currency)}</p></div>
      </div>
      <div className="mt-6 grid gap-5 border-t pt-5 sm:grid-cols-2"><div><p className="text-xs uppercase text-slate-500">Payment details</p><p className="mt-1">{String(lines[0]?.description || "Cheque payment")}</p></div><div><p className="text-xs uppercase text-slate-500">Memo / bill references</p><p className="mt-1 whitespace-pre-wrap">{String(record.memo || "—")}</p></div></div>
      <div className="mt-8 grid grid-cols-3 gap-8 pt-8 text-center text-xs font-semibold text-slate-500"><p className="border-t pt-2">PREPARED BY</p><p className="border-t pt-2">CHECKED BY</p><p className="border-t pt-2">APPROVED BY</p></div>
    </section>
  </div>;
}
