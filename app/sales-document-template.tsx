"use client";

import { useRef, useState } from "react";
import { Download, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveDocumentDesign, type TemplateDocumentType } from "@/lib/document-design";
import { documentPageRule } from "@/lib/document-print";
import { createA4PdfBlob, documentPdfFileName, downloadPdfBlob, savePdfBlob } from "@/lib/document-output";
import { CustomInvoiceTemplate, type TemplateBranding } from "./custom-invoice-template";
import { InvoicePackingListDialog } from "./invoice-packing-list";
import { toast } from "sonner";

type RecordData = Record<string, string | number | boolean>;
type Branding = TemplateBranding & { documentDesign?: string };
export const salesDocumentTitles = {
  "tax-invoice": "Tax Invoice",
  estimate: "Estimate",
  "proforma-invoice": "Proforma Invoice",
  "sales-order": "Sales Order",
  "purchase-order": "Purchase Order",
  "credit-note": "Credit Note",
  refund: "Refund",
  quotation: "Quotation",
  "cash-sales": "Sales Receipt",
  "delivery-note": "Delivery Note",
  "packing-list": "Packing List",
} as const;
export type SalesDocumentMode = keyof typeof salesDocumentTitles;

const savedTemplateType: Partial<Record<SalesDocumentMode, TemplateDocumentType>> = {
  "tax-invoice": "Invoice",
  estimate: "Estimate",
  "proforma-invoice": "Proforma Invoice",
  "sales-order": "Sales Order",
  "purchase-order": "Purchase Order",
  "credit-note": "Credit Note",
  refund: "Refund",
  "cash-sales": "Sales Receipt",
  "delivery-note": "Delivery Note",
  "packing-list": "Packing List",
};

const relatedDocumentOutputs: Partial<Record<SalesDocumentMode, SalesDocumentMode[]>> = {
  "tax-invoice": ["tax-invoice", "delivery-note", "packing-list"],
  "sales-order": ["sales-order", "delivery-note", "packing-list"],
  "proforma-invoice": ["proforma-invoice", "delivery-note", "packing-list"],
  "cash-sales": ["cash-sales", "delivery-note", "packing-list"],
};

export function salesDocumentModeForTransaction(type: string): SalesDocumentMode | null {
  switch (type.toLowerCase()) {
    case "invoice": return "tax-invoice";
    case "estimate": return "estimate";
    case "proforma invoice": return "proforma-invoice";
    case "sales order": return "sales-order";
    case "purchase order": return "purchase-order";
    case "credit memo":
    case "credit note": return "credit-note";
    case "refund": return "refund";
    case "sales receipt": return "cash-sales";
    case "quotation": return "quotation";
    case "delivery note": return "delivery-note";
    case "packing list": return "packing-list";
    default: return null;
  }
}

// Each transaction type resolves its own active saved Company Setup template.
// Invoice-like documents can also switch to the saved Delivery Note or Packing List
// layout from the document preview, so every template is connected to its real output.
export function SalesDocumentTemplate({ mode, record, lines, contact, setup }: { mode: SalesDocumentMode; record: RecordData; lines: RecordData[]; contact?: RecordData | null; setup: Branding; showBillingName: boolean; showShipping: boolean; showHsCode: boolean; showDimensions: boolean }) {
  const outputModes = relatedDocumentOutputs[mode] ?? [mode];
  const [selection, setSelection] = useState<{ source: SalesDocumentMode; output: SalesDocumentMode }>({ source: mode, output: mode });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [packingOpen, setPackingOpen] = useState(false);
  const connectedPackingList = String(record.type) === "invoice";
  const activeMode = selection.source === mode && outputModes.includes(selection.output) ? selection.output : mode;
  const requestedTemplateType = savedTemplateType[activeMode];
  const { design, savedTemplate } = resolveDocumentDesign(setup.documentDesign, requestedTemplateType);
  if (!savedTemplate || savedTemplate.appliesToAll || (requestedTemplateType && savedTemplate.type !== requestedTemplateType)) design.title = salesDocumentTitles[activeMode];

  const a4Design = { ...design, paper: "A4" as const, printerMode: "specified" as const };
  const pageRule = documentPageRule(a4Design);
  const screenPreviewRef = useRef<HTMLDivElement>(null);
  const customerName = String(contact?.billingName || contact?.company || record.party || "Customer");
  const referenceNumber = String(record.number || "Document");
  const pdfFileName = documentPdfFileName(customerName, referenceNumber);
  const pdfTitle = pdfFileName.replace(/\.pdf$/i, "");
  const pdfElement = () => screenPreviewRef.current?.querySelector<HTMLElement>(".custom-invoice") || null;

  const printA4 = () => {
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print this document.");
    popup.opener = null;
    const source = screenPreviewRef.current?.innerHTML || "";
    const invoice = screenPreviewRef.current?.querySelector<HTMLElement>(".custom-invoice");
    if (!source || !invoice) { popup.close(); return toast.error("Document preview is not ready."); }

    const rect = invoice.getBoundingClientRect();
    const sourceWidth = Math.max(1, Math.ceil(Math.max(rect.width, invoice.scrollWidth)));
    const sourceHeight = Math.max(1, Math.ceil(Math.max(rect.height, invoice.scrollHeight)));
    const portrait = a4Design.orientation !== "landscape";
    const pageWidthMm = portrait ? 210 : 297;
    const pageHeightMm = portrait ? 297 : 210;
    const printableWidthPx = Math.max(1, (pageWidthMm - a4Design.margin * 2) * 96 / 25.4);
    const printableHeightPx = Math.max(1, (pageHeightMm - a4Design.margin * 2) * 96 / 25.4);
    const scale = Math.min(1, printableWidthPx / sourceWidth, printableHeightPx / sourceHeight);
    const scaledHeight = Math.max(1, Math.ceil(sourceHeight * scale));
    const copies = Array.from({ length: a4Design.copies }, () =>
      `<section class="print-copy" style="width:${printableWidthPx}px;height:${scaledHeight}px"><div class="print-fit" style="width:${sourceWidth}px;transform:scale(${scale});transform-origin:top left">${source}</div></section>`
    ).join("");
    const pageNumbers = a4Design.printPageNumbers ? '@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px Arial,sans-serif;color:#475569;}' : "";

    popup.document.write(`<!doctype html><html><head><title>${pdfTitle}</title><style>
      @page{size:A4 ${a4Design.orientation};margin:${a4Design.margin}mm;${pageNumbers}}
      html,body{margin:0;padding:0;background:#fff}
      .print-toolbar{position:sticky;top:0;z-index:9999;display:flex;justify-content:flex-end;gap:8px;padding:10px;background:#0f172a}
      .print-toolbar button{border:1px solid #64748b;border-radius:8px;background:#fff;color:#0f172a;padding:8px 14px;font:600 14px Arial,sans-serif;cursor:pointer}
      .print-copy{break-after:page;position:relative;overflow:visible}
      .print-copy:last-child{break-after:auto}
      .print-fit{position:relative}
      .custom-invoice{max-width:none!important}
      .custom-invoice .ci-editable{outline:none!important;box-shadow:none!important}
      .custom-invoice .ci-editable::after{display:none!important}
      @media print{
        .print-toolbar{display:none!important}
        .print-copy{break-inside:avoid-page}
        .custom-invoice{max-width:none!important;min-width:0!important}
        .custom-invoice table{table-layout:fixed!important}
      }
    </style></head><body>
      <div class="print-toolbar"><button type="button" onclick="window.print()">Print</button><button type="button" onclick="window.close()">Close</button></div>
      ${copies}
    </body></html>`);
    popup.document.close();

    const triggerPrint = () => {
      if (popup.closed) return;
      popup.focus();
      try { popup.print(); } catch { /* The visible Print button remains available as a fallback. */ }
    };
    const images = Array.from(popup.document.images);
    void Promise.all(images.map((img) => img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))
      .then(() => window.setTimeout(triggerPrint, 100));
  };

  const savePdf = async () => {
    const target = pdfElement();
    if (!target) return toast.error("Document preview is not ready.");
    setPdfBusy(true);
    try {
      const blob = await createA4PdfBlob(target, { orientation: a4Design.orientation, marginMm: a4Design.margin, title: pdfTitle });
      await savePdfBlob(blob, pdfFileName);
      toast.success(`PDF saved as ${pdfFileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    const target = pdfElement();
    if (!target) return toast.error("Document preview is not ready.");
    setPdfBusy(true);
    try {
      const blob = await createA4PdfBlob(target, { orientation: a4Design.orientation, marginMm: a4Design.margin, title: pdfTitle });
      downloadPdfBlob(blob, pdfFileName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  return <>
    <style>{`${pageRule}
      .invoice-print-only{display:none}
      @media screen{
        .document-print-surface > .document-internal-only:has(> h3 + .overflow-hidden){display:none!important}
      }
      @media print{
        html,body{width:100%!important;height:auto!important;min-width:0!important;margin:0!important;padding:0!important;background:#fff!important}
        body:has(.custom-invoice) *:not(:has(.custom-invoice)):not(.custom-invoice):not(.custom-invoice *){display:none!important}
        body:has(.custom-invoice) [data-slot="dialog-overlay"]{display:none!important}
        body:has(.custom-invoice) [data-slot="dialog-content"]:has(.custom-invoice){display:block!important;position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-width:none!important;max-height:none!important;overflow:visible!important;border:0!important;border-radius:0!important;margin:0!important;padding:0!important;box-shadow:none!important;background:#fff!important}
        body:has(.custom-invoice) .document-print-surface:has(.custom-invoice){display:block!important;position:static!important;inset:auto!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;color:#0f172a!important;overflow:visible!important}
        body:has(.custom-invoice) .document-internal-only{display:none!important}
        body:has(.custom-invoice) .invoice-screen-only{display:none!important}
        body:has(.custom-invoice) .invoice-print-only{display:block!important;visibility:visible!important;position:static!important;width:100%!important;margin:0!important;padding:0!important}
        body:has(.custom-invoice) .invoice-print-only *{visibility:visible!important}
        body:has(.custom-invoice) .custom-invoice{display:block!important;position:static!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;overflow:visible!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
        body:has(.custom-invoice) .custom-invoice .ci-head{grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr)!important}
        body:has(.custom-invoice) .custom-invoice .ci-meta{grid-template-columns:repeat(3,minmax(0,1fr))!important}
        body:has(.custom-invoice) .custom-invoice .ci-bottom{grid-template-columns:minmax(0,3fr) minmax(0,2fr)!important}
        body:has(.custom-invoice) .custom-invoice table{width:100%!important;max-width:100%!important;table-layout:fixed!important}
        body:has(.custom-invoice) .custom-invoice th,body:has(.custom-invoice) .custom-invoice td{overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important}
      }`}</style>
    <div className="document-internal-only mb-3 flex flex-wrap items-center justify-between gap-2">
      {outputModes.length > 1 ? <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-2 text-sm">
        <span className="px-1 font-semibold text-slate-700">Document layout</span>
        {outputModes.map((outputMode) => <Button key={outputMode} type="button" size="sm" variant={activeMode === outputMode && !(outputMode === "packing-list" && connectedPackingList) ? "default" : "outline"} aria-pressed={activeMode === outputMode} onClick={() => outputMode === "packing-list" && connectedPackingList ? setPackingOpen(true) : setSelection({ source: mode, output: outputMode })}>{salesDocumentTitles[outputMode]}</Button>)}
      </div> : <div />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={printA4}>
          <Printer className="size-4" />Print
        </Button>
        <Button type="button" variant="outline" onClick={() => void savePdf()} disabled={pdfBusy}>
          <FileDown className="size-4" />{pdfBusy ? "Preparing…" : "Save as PDF"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void downloadPdf()} disabled={pdfBusy}>
          <Download className="size-4" />Download
        </Button>
      </div>
    </div>
    <div ref={screenPreviewRef} className="invoice-screen-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} /></div>
    <div className="invoice-print-only"><CustomInvoiceTemplate design={a4Design} record={record} lines={lines} contact={contact} setup={setup} target="print" /></div>
    {connectedPackingList ? <InvoicePackingListDialog open={packingOpen} onOpenChange={setPackingOpen} companyId={Number(record.companyId)} companyName={String(setup.name || "Company")} invoiceId={Number(record.id)} /> : null}
  </>;
}
