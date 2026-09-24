"use client";

import { useState, type CSSProperties } from "react";
import { Check, FileText, Move, Pencil, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inferUaeChequeLayout, uaeChequeLayout, type ChequeFieldPosition } from "@/lib/uae-cheque-layouts";

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

function positionStyle(position: ChequeFieldPosition): CSSProperties {
  return { left: `${position.left}mm`, top: `${position.top}mm`, width: `${position.width}mm` };
}

function ChequeFields({ date, party, words, amount, currency, crossed, layout, preview = false }: {
  date: string; party: string; words: string; amount: number; currency: string; crossed: boolean;
  layout: ReturnType<typeof uaeChequeLayout>; preview?: boolean;
}) {
  const formattedDate = date ? date.split("-").reverse().join(" / ") : "";
  const fieldClass = preview ? "absolute rounded border border-dashed border-sky-400/80 bg-sky-50/70 px-1 text-slate-950" : "absolute text-black";
  return <>
    {crossed && <div className={`${fieldClass} whitespace-nowrap text-[9pt] font-bold`} style={{ ...positionStyle(layout.crossing), transform: "rotate(-7deg)" }}>A/C PAYEE ONLY</div>}
    <div className={`${fieldClass} text-center font-mono text-[11pt] font-semibold tracking-wide`} style={positionStyle(layout.date)}>{formattedDate}</div>
    <div className={`${fieldClass} truncate text-[11pt] font-semibold uppercase`} style={positionStyle(layout.payee)}>** {party} **</div>
    <div className={`${fieldClass} text-[9.5pt] font-semibold uppercase leading-[1.35]`} style={positionStyle(layout.words)}>** {words} **</div>
    <div className={`${fieldClass} text-right font-mono text-[11pt] font-bold tabular-nums`} style={positionStyle(layout.amount)}>**{currency} {amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**</div>
  </>;
}

export function UaeBankCheque({ record, lines, journal, companyName, revision, canEditNumber = false, onNumberSaved }: { record: ChequeRecord; lines: ChequeRecord[]; journal: ChequeRecord[]; companyName: string; revision: string; canEditNumber?: boolean; onNumberSaved?: (number: string, revision: string) => void }) {
  const amount = Number(record.total || lines[0]?.total || 0);
  const currency = String(record.currency || "AED");
  const bankName = String(journal.find((line) => Number(line.credit) > 0)?.accountName || "Selected UAE bank account");
  const date = String(record.transactionDate || "");
  const crossed = String(record.terms || "account-payee") !== "bearer";
  const selectedLayout = uaeChequeLayout(String(record.chequeBankKey || inferUaeChequeLayout(bankName)));
  const words = amountInWords(amount, currency);
  const [offsetX, setOffsetX] = useState("0");
  const [offsetY, setOffsetY] = useState("0");
  const [chequeNumber, setChequeNumber] = useState(String(record.number));
  const [numberDraft, setNumberDraft] = useState(String(record.number));
  const [editingNumber, setEditingNumber] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [numberError, setNumberError] = useState("");
  const calibrationStyle = { "--cheque-offset-x": `${Number(offsetX) || 0}mm`, "--cheque-offset-y": `${Number(offsetY) || 0}mm` } as CSSProperties;

  function print(mode: "cheque" | "voucher") {
    const root = document.documentElement;
    const oldPageStyle = document.getElementById("uae-cheque-page-size");
    oldPageStyle?.remove();
    const pageStyle = document.createElement("style");
    pageStyle.id = "uae-cheque-page-size";
    pageStyle.textContent = mode === "cheque"
      ? `@page { size: ${selectedLayout.widthMm}mm ${selectedLayout.heightMm}mm; margin: 0; }`
      : "@page { size: A4 portrait; margin: 10mm; }";
    document.head.appendChild(pageStyle);
    root.dataset.chequePrintMode = mode;
    root.style.setProperty("--cheque-page-width", `${selectedLayout.widthMm}mm`);
    root.style.setProperty("--cheque-page-height", `${selectedLayout.heightMm}mm`);
    const cleanup = () => {
      delete root.dataset.chequePrintMode;
      root.style.removeProperty("--cheque-page-width");
      root.style.removeProperty("--cheque-page-height");
      pageStyle.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
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
        <div><p className="font-bold text-slate-900">UAE Bank Cheque</p><p className="text-sm text-slate-500">{selectedLayout.name} · Saved cheque {chequeNumber}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => print("cheque")}><Printer className="size-4" />Print on bank cheque</Button>
          <Button type="button" variant="outline" onClick={() => print("voucher")}><FileText className="size-4" />Print A4 voucher</Button>
        </div>
      </div>
      {canEditNumber && <div className="rounded-lg border bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1"><Label htmlFor="saved-cheque-number" className="text-xs">Cheque number</Label><Input id="saved-cheque-number" value={numberDraft} disabled={!editingNumber || savingNumber} maxLength={100} onChange={(event) => { setNumberDraft(event.target.value); setNumberError(""); }} /></div>
          {editingNumber ? <><Button type="button" size="sm" disabled={savingNumber} onClick={() => void saveChequeNumber()}><Check className="size-4" />{savingNumber ? "Saving…" : "Save number"}</Button><Button type="button" size="sm" variant="outline" disabled={savingNumber} onClick={() => { setNumberDraft(chequeNumber); setNumberError(""); setEditingNumber(false); }}><X className="size-4" />Cancel</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => setEditingNumber(true)}><Pencil className="size-4" />Edit cheque number</Button>}
        </div>
        {numberError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{numberError}</p>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem] sm:items-end">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><strong>Before the first print:</strong> use plain paper to test alignment, then load the bank cheque in the same orientation. Printer scaling must be 100% / Actual size.</div>
        <div className="space-y-1"><Label htmlFor="cheque-offset-x" className="flex items-center gap-1 text-xs"><Move className="size-3" />Horizontal mm</Label><Input id="cheque-offset-x" type="number" step="0.5" value={offsetX} onChange={(event) => setOffsetX(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="cheque-offset-y" className="flex items-center gap-1 text-xs"><Move className="size-3" />Vertical mm</Label><Input id="cheque-offset-y" type="number" step="0.5" value={offsetY} onChange={(event) => setOffsetY(event.target.value)} /></div>
      </div>
    </div>

    <div className="document-internal-only overflow-x-auto rounded-xl border bg-slate-100 p-4 print:hidden">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Bank cheque alignment preview · blue boxes are not printed</p>
      <div className="uae-cheque-preview relative mx-auto overflow-hidden border border-slate-400 bg-[#f4f0d7] shadow-sm" style={{ width: `${selectedLayout.widthMm}mm`, height: `${selectedLayout.heightMm}mm`, ...calibrationStyle }}>
        <div className="absolute inset-0 grid place-items-center text-2xl font-black tracking-[.25em] text-slate-400/30">{selectedLayout.name}</div>
        <div className="uae-cheque-calibrated absolute inset-0"><ChequeFields date={date} party={String(record.party)} words={words} amount={amount} currency={currency} crossed={crossed} layout={selectedLayout} preview /></div>
      </div>
    </div>

    <div className="uae-cheque-print-layer" style={{ width: `${selectedLayout.widthMm}mm`, height: `${selectedLayout.heightMm}mm`, ...calibrationStyle }} aria-hidden="true">
      <div className="uae-cheque-calibrated absolute inset-0"><ChequeFields date={date} party={String(record.party)} words={words} amount={amount} currency={currency} crossed={crossed} layout={selectedLayout} /></div>
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
