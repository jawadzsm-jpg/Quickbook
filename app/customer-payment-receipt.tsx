"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createA4LetterheadPdfBlob, downloadPdfBlob } from "@/lib/document-output";
import { defaultLetterhead, letterheadForDocument } from "@/lib/letterhead";
import { InvoiceAttachments } from "./invoice-attachments";
import { LetterheadBrand, LetterheadStamp, type LetterheadCompany } from "./letterhead-page";

type RecordData = Record<string, string | number | boolean | null | undefined>;
type PaymentCompany = LetterheadCompany & {
  id: number;
  letterheadDesign: string;
  documentColor: string;
  baseCurrency: string;
  trn?: string;
};

const money = (value: unknown, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
const cleanFilePart = (value: unknown, fallback: string) => String(value ?? "").trim().replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "") || fallback;
const a4PreviewFallback = { width: 210 * 96 / 25.4, height: 297 * 96 / 25.4 };

function withoutPreviewScale(page: HTMLElement) {
  const clone = page.cloneNode(true) as HTMLElement;
  clone.style.removeProperty("transform");
  clone.style.removeProperty("transform-origin");
  clone.style.removeProperty("box-shadow");
  return clone;
}

async function withUnscaledPage<T>(page: HTMLElement, task: (printablePage: HTMLElement) => Promise<T>) {
  const printablePage = withoutPreviewScale(page);
  printablePage.style.position = "fixed";
  printablePage.style.left = "-10000px";
  printablePage.style.top = "0";
  printablePage.style.zIndex = "-1";
  document.body.appendChild(printablePage);
  try {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    return await task(printablePage);
  } finally {
    printablePage.remove();
  }
}

export function CustomerPaymentReceipt({ record, lines, company, canEditAttachments }: { record: RecordData; lines: RecordData[]; company: PaymentCompany; canEditAttachments: boolean }) {
  const assigned = letterheadForDocument(company.letterheadDesign, "customer-payment");
  const template = assigned ?? { ...defaultLetterhead(), color: company.documentColor || "#059669" };
  const [stamp, setStamp] = useState({ show: Boolean(company.stampData && assigned?.showStamp), left: assigned?.stampLeft ?? 155, top: assigned?.stampTop ?? 230 });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [preview, setPreview] = useState({ ...a4PreviewFallback, scale: 1 });
  const previewRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const currency = String(record.currency || company.baseCurrency || "AED");
  const paymentMethod = String(record.paymentMethod || "Bank transfer");
  const referenceNo = String(record.referenceNo || record.number || "—");
  const fileName = `${cleanFilePart(record.party, "Customer")}_${cleanFilePart(record.number, "Payment")}.pdf`;
  const receiptTemplate = { ...template, showStamp: stamp.show, stampLeft: stamp.left, stampTop: stamp.top };

  useEffect(() => {
    const container = previewRef.current;
    const page = pageRef.current;
    if (!container || !page) return;
    const fitPreview = () => {
      const width = page.offsetWidth || a4PreviewFallback.width;
      const height = page.offsetHeight || a4PreviewFallback.height;
      const horizontalPadding = window.matchMedia("(min-width: 640px)").matches ? 24 : 16;
      const scale = Math.min(1, Math.max(0.2, (container.clientWidth - horizontalPadding) / width));
      setPreview((current) => current.width === width && current.height === height && Math.abs(current.scale - scale) < 0.001 ? current : { width, height, scale });
    };
    fitPreview();
    const observer = new ResizeObserver(fitPreview);
    observer.observe(container);
    window.addEventListener("resize", fitPreview);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitPreview);
    };
  }, []);

  const print = () => {
    const page = pageRef.current;
    if (!page) return toast.error("Payment receipt preview is not ready.");
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the payment receipt.");
    popup.opener = null;
    const appStyles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')).map((node) => node.outerHTML).join("");
    const printablePage = withoutPreviewScale(page);
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${fileName}</title>${appStyles}<style>@page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important;color:#0f172a!important;font-family:Arial,sans-serif}.payment-receipt-page{width:210mm!important;height:297mm!important;overflow:hidden!important;margin:0!important;transform:none!important;box-shadow:none!important;background:#fff!important;color:#0f172a!important}.letterhead-stamp{cursor:default!important}.print-controls{padding:10px;background:#0f172a}@media print{.print-controls{display:none!important}}</style></head><body><div class="print-controls"><button onclick="window.print()">Print / Save PDF</button></div>${printablePage.outerHTML}</body></html>`);
    popup.document.close();
  };

  const download = async () => {
    if (!pageRef.current) return toast.error("Payment receipt preview is not ready.");
    setPdfBusy(true);
    try {
      const blob = await withUnscaledPage(pageRef.current, (printablePage) => createA4LetterheadPdfBlob(printablePage, `Customer Payment ${String(record.number || "")}`));
      downloadPdfBlob(blob, fileName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the customer payment PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  return <div className="space-y-4">
    <div className="document-internal-only flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
      <div><p className="font-semibold">Customer Payment Receipt · A4 portrait</p><p className="text-xs text-muted-foreground">VAT is not applied to customer payments. Print and PDF use the same fitted A4 layout.</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant={stamp.show ? "default" : "outline"} disabled={!company.stampData} onClick={() => setStamp({ ...stamp, show: !stamp.show })}><Stamp className="size-4" />{stamp.show ? "Stamp on" : "Stamp off"}</Button><Button type="button" variant="outline" disabled={!company.stampData} onClick={() => setStamp({ show: true, left: 155, top: 230 })}>Reset stamp</Button><Button type="button" variant="outline" onClick={print}><Printer className="size-4" />Print A4</Button><Button type="button" variant="outline" disabled={pdfBusy} onClick={() => void download()}><Download className="size-4" />{pdfBusy ? "Creating…" : "PDF A4"}</Button></div>
    </div>
    <div ref={previewRef} className="overflow-hidden rounded-xl border bg-slate-200 p-2 dark:bg-slate-950 sm:p-3">
      <div className="mx-auto" style={{ width: preview.width * preview.scale, height: preview.height * preview.scale }}>
      <article ref={pageRef} className="payment-receipt-page letterhead-page report-print-surface relative h-[297mm] w-[210mm] overflow-hidden bg-white p-[13mm] text-slate-900 shadow-xl" style={{ fontFamily: "Arial, sans-serif", transform: `scale(${preview.scale})`, transformOrigin: "top left" }}>
        <LetterheadBrand template={receiptTemplate} company={company} />
        <header className="flex items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: template.color }}><div><p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: template.color }}>Official receipt</p><h2 className="mt-2 text-3xl font-bold">Customer Payment</h2><p className="mt-1 text-sm text-slate-500">Payment No. {String(record.number || "—")}</p></div><div className="rounded-xl border-4 px-5 py-3 text-center text-lg font-extrabold uppercase tracking-wider" style={{ borderColor: template.color, color: template.color }}>Payment<br />Received</div></header>
        <section className="mt-6 grid grid-cols-2 gap-4 text-sm"><div className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Received from</p><p className="mt-2 text-lg font-bold">{String(record.party || "—")}</p><p className="mt-2 text-slate-600">Date: {String(record.transactionDate || "—")}</p>{company.trn ? <p className="mt-1 text-slate-600">Company TRN: {company.trn}</p> : null}</div><div className="rounded-xl border p-4"><dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2"><dt className="text-slate-500">Payment method</dt><dd className="font-semibold">{paymentMethod}</dd><dt className="text-slate-500">Reference No.</dt><dd className="break-all font-semibold">{referenceNo}</dd><dt className="text-slate-500">Deposit to</dt><dd className="font-semibold">{String(record.account || "—")}</dd><dt className="text-slate-500">Currency</dt><dd className="font-semibold">{currency}</dd></dl></div></section>
        <section className="mt-6 rounded-xl border p-5"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount received</p><p className="mt-2 text-3xl font-bold" style={{ color: template.color }}>{money(record.total, currency)}</p></div><div className="text-right text-sm"><p className="text-slate-500">VAT</p><strong>Not applicable</strong></div></div><div className="mt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Applied to</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{lines.map((line) => String(line.description || "Payment received")).join("\n") || "Customer account payment"}</p></div></section>
        {record.memo ? <section className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Memo</p><p className="mt-2 whitespace-pre-wrap">{String(record.memo)}</p></section> : null}
        <footer className="absolute bottom-[18mm] left-[13mm] right-[13mm] grid grid-cols-2 gap-10 border-t pt-8 text-sm text-slate-600"><div>Received by: __________________________</div><div>Authorized signature: __________________________</div></footer>
        <LetterheadStamp template={receiptTemplate} company={company} maxLeft={170} maxTop={260} onMove={(left, top) => setStamp({ ...stamp, left, top })} />
      </article>
      </div>
    </div>
    <InvoiceAttachments companyId={Number(record.companyId)} invoiceId={Number(record.id)} canEdit={canEditAttachments} documentLabel="Customer Payment" />
  </div>;
}
