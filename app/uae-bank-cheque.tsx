"use client";

import { useState, type CSSProperties } from "react";
import { Check, FileText, Move, Pencil, Printer, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inferUaeChequeLayout, uaeChequeLayout, uaeChequeLayouts, type ChequeFieldPosition } from "@/lib/uae-cheque-layouts";

type RecordValue = string | number | boolean;
type ChequeRecord = Record<string, RecordValue> & { id: number };
const MAX_ALIGNMENT_OFFSET_MM = 25;

function safeAlignmentOffset(value: string): number {
  const offset = Number(value);
  return Number.isFinite(offset) && Math.abs(offset) <= MAX_ALIGNMENT_OFFSET_MM ? offset : 0;
}

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

function escapeMarkup(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function fieldPositionCss(position: ChequeFieldPosition): string {
  return `left:${position.left}mm;top:${position.top}mm;width:${position.width}mm`;
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

function chequePrintBody({ date, party, words, amount, currency, crossed, layout, offsetX, offsetY }: {
  date: string; party: string; words: string; amount: number; currency: string; crossed: boolean;
  layout: ReturnType<typeof uaeChequeLayout>; offsetX: number; offsetY: number;
}): string {
  const formattedDate = date ? date.split("-").reverse().join(" / ") : "";
  const crossing = crossed ? `<div class="field crossing" style="${fieldPositionCss(layout.crossing)}">A/C PAYEE ONLY</div>` : "";
  return `<main class="cheque-page"><div class="calibrated" style="transform:translate(${offsetX}mm,${offsetY}mm)">${crossing}<div class="field date" style="${fieldPositionCss(layout.date)}">${escapeMarkup(formattedDate)}</div><div class="field payee" style="${fieldPositionCss(layout.payee)}">** ${escapeMarkup(party)} **</div><div class="field words" style="${fieldPositionCss(layout.words)}">** ${escapeMarkup(words)} **</div><div class="field amount" style="${fieldPositionCss(layout.amount)}">**${escapeMarkup(currency)} ${escapeMarkup(amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}**</div></div></main>`;
}

function voucherPrintBody({ companyName, chequeNumber, bankName, layoutName, party, date, amount, currency, words, details, memo }: {
  companyName: string; chequeNumber: string; bankName: string; layoutName: string; party: string; date: string;
  amount: number; currency: string; words: string; details: string; memo: string;
}): string {
  return `<main class="voucher-page"><header><div><p class="company">${escapeMarkup(companyName)}</p><h1>CHEQUE PAYMENT VOUCHER</h1><p class="muted">${escapeMarkup(bankName)} · ${escapeMarkup(layoutName)}</p></div><div class="number"><span>CHEQUE NUMBER</span><strong>${escapeMarkup(chequeNumber)}</strong></div></header><section class="facts"><div><span>PAYEE</span><strong>${escapeMarkup(party)}</strong></div><div><span>CHEQUE DATE</span><strong>${escapeMarkup(date)}</strong></div><div><span>PAY FROM</span><strong>${escapeMarkup(bankName)}</strong></div><div><span>AMOUNT</span><strong>${escapeMarkup(money(amount, currency))}</strong></div></section><section class="words"><span>AMOUNT IN WORDS</span><strong>${escapeMarkup(words)}</strong></section><section class="details"><div><span>PAYMENT DETAILS</span><p>${escapeMarkup(details)}</p></div><div><span>MEMO / BILL REFERENCES</span><p>${escapeMarkup(memo || "—")}</p></div></section><footer><p>PREPARED BY</p><p>CHECKED BY</p><p>APPROVED BY</p></footer></main>`;
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
    <div className={`${fieldClass} whitespace-nowrap text-right font-mono text-[10pt] font-bold tabular-nums`} style={positionStyle(layout.amount)}>**{currency} {amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**</div>
  </>;
}

export function UaeBankCheque({ record, lines, journal, companyName, revision, canEditNumber = false, onNumberSaved }: { record: ChequeRecord; lines: ChequeRecord[]; journal: ChequeRecord[]; companyName: string; revision: string; canEditNumber?: boolean; onNumberSaved?: (number: string, revision: string) => void }) {
  const amount = Number(record.total || lines[0]?.total || 0);
  const currency = String(record.currency || "AED");
  const bankName = String(journal.find((line) => Number(line.credit) > 0)?.accountName || "Selected UAE bank account");
  const date = String(record.transactionDate || "");
  const crossed = String(record.terms || "account-payee") !== "bearer";
  const [layoutKey, setLayoutKey] = useState(String(record.chequeBankKey || inferUaeChequeLayout(bankName)));
  const [savedLayoutKey, setSavedLayoutKey] = useState(String(record.chequeBankKey || inferUaeChequeLayout(bankName)));
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const selectedLayout = uaeChequeLayout(layoutKey);
  const words = amountInWords(amount, currency);
  const [offsetX, setOffsetX] = useState("0");
  const [offsetY, setOffsetY] = useState("0");
  const [chequeNumber, setChequeNumber] = useState(String(record.number));
  const [numberDraft, setNumberDraft] = useState(String(record.number));
  const [editingNumber, setEditingNumber] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [numberError, setNumberError] = useState("");
  const [alignmentMessage, setAlignmentMessage] = useState("");
  const calibrationStyle = { "--cheque-offset-x": `${safeAlignmentOffset(offsetX)}mm`, "--cheque-offset-y": `${safeAlignmentOffset(offsetY)}mm` } as CSSProperties;

  async function saveLayout() {
    setSavingLayout(true);
    setLayoutError("");
    try {
      const response = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "transactions", id: record.id, companyId: Number(record.companyId), revision, editMode: "cheque-layout", chequeBankKey: layoutKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the cheque layout.");
      setSavedLayoutKey(layoutKey);
      onNumberSaved?.(chequeNumber, String(data.revision || ""));
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "Could not save the cheque layout.");
    } finally {
      setSavingLayout(false);
    }
  }

  function print(mode: "cheque" | "voucher") {
    const safeX = safeAlignmentOffset(offsetX);
    const safeY = safeAlignmentOffset(offsetY);
    const invalidAlignment = Number(offsetX) !== safeX || Number(offsetY) !== safeY;
    const printX = invalidAlignment ? 0 : safeX;
    const printY = invalidAlignment ? 0 : safeY;
    if (mode === "cheque" && invalidAlignment) {
      setOffsetX("0");
      setOffsetY("0");
      setAlignmentMessage("Paper dimensions cannot be used as alignment. Both movements were reset to 0 mm.");
    }
    if (mode === "cheque") {
      const styles = `@page{size:${selectedLayout.widthMm}mm ${selectedLayout.heightMm}mm;margin:0}*{box-sizing:border-box}html,body{width:${selectedLayout.widthMm}mm;height:${selectedLayout.heightMm}mm;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff;color:#000;font-family:Arial,sans-serif}.cheque-page,.calibrated{position:relative;width:${selectedLayout.widthMm}mm;height:${selectedLayout.heightMm}mm;overflow:hidden}.calibrated{position:absolute;inset:0}.field{position:absolute;overflow:hidden;color:#000}.crossing{white-space:nowrap;font-size:9pt;font-weight:700;transform:rotate(-7deg)}.date{text-align:center;white-space:nowrap;font:600 11pt monospace;letter-spacing:.04em}.payee{white-space:nowrap;text-overflow:clip;font-size:11pt;font-weight:600;text-transform:uppercase}.words{font-size:9.5pt;font-weight:600;line-height:1.35;text-transform:uppercase}.amount{text-align:right;font:700 10pt monospace;line-height:1.15;white-space:nowrap;font-variant-numeric:tabular-nums}@media print{html,body,.cheque-page{break-after:avoid;break-inside:avoid;page-break-after:avoid;page-break-inside:avoid}}`;
      printIsolatedDocument(`Cheque ${chequeNumber}`, styles, chequePrintBody({ date, party: String(record.party), words, amount, currency, crossed, layout: selectedLayout, offsetX: printX, offsetY: printY }));
      return;
    }
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
        <div><p className="font-bold text-slate-900">UAE Bank Cheque</p><p className="text-sm text-slate-500">{selectedLayout.name} · {selectedLayout.widthMm} × {selectedLayout.heightMm} mm · Saved cheque {chequeNumber}</p></div>
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
      <div className="space-y-2"><Label htmlFor="cheque-print-layout">Cheque bank layout for this print</Label><div className="flex flex-wrap gap-2"><select id="cheque-print-layout" className="flex h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm" value={selectedLayout.key} onChange={(event) => { setLayoutKey(event.target.value); setOffsetX("0"); setOffsetY("0"); setAlignmentMessage(""); setLayoutError(""); }}>{uaeChequeLayouts.map((layout) => <option key={layout.key} value={layout.key}>{layout.name}</option>)}</select>{canEditNumber && <Button type="button" variant="outline" disabled={savingLayout || layoutKey === savedLayoutKey} onClick={() => void saveLayout()}><Check className="size-4" />{savingLayout ? "Saving…" : "Save layout"}</Button>}</div><p className="text-xs text-slate-600">Match the bank name on the physical cheque before adjusting the print. Changing the layout resets the fine adjustment.</p>{layoutError && <p role="alert" className="text-xs font-medium text-red-600">{layoutError}</p>}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
        <div className="space-y-2"><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950"><strong>Fixed paper size:</strong> {selectedLayout.widthMm} × {selectedLayout.heightMm} mm ({selectedLayout.widthMm / 10} × {selectedLayout.heightMm / 10} cm). This is applied automatically.</div><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><strong>Before printing:</strong> use 100% / Actual size and no margins. Use the signed movements only for fine alignment (−25 to +25 mm), not for paper dimensions. A 150 mm movement would put the text off the cheque.</div></div>
        <div className="space-y-1"><Label htmlFor="cheque-offset-x" className="flex items-center gap-1 text-xs"><Move className="size-3" />Move right (+) / left (-), mm</Label><Input id="cheque-offset-x" type="number" min={-MAX_ALIGNMENT_OFFSET_MM} max={MAX_ALIGNMENT_OFFSET_MM} step="0.5" value={offsetX} onChange={(event) => { setOffsetX(event.target.value); setAlignmentMessage(""); }} /></div>
        <div className="space-y-1"><Label htmlFor="cheque-offset-y" className="flex items-center gap-1 text-xs"><Move className="size-3" />Move down (+) / up (-), mm</Label><Input id="cheque-offset-y" type="number" min={-MAX_ALIGNMENT_OFFSET_MM} max={MAX_ALIGNMENT_OFFSET_MM} step="0.5" value={offsetY} onChange={(event) => { setOffsetY(event.target.value); setAlignmentMessage(""); }} /></div>
        <Button type="button" variant="outline" onClick={() => { setOffsetX("0"); setOffsetY("0"); setAlignmentMessage("Alignment reset to 0 mm."); }}><RotateCcw className="size-4" />Reset</Button>
      </div>
      {alignmentMessage && <p role="status" className="text-xs font-medium text-amber-700">{alignmentMessage}</p>}
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
