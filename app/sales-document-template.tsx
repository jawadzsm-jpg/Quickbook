"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, FileDown, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintOrientationSelect, type PrintOrientation } from "@/components/print-orientation-select";
import { resolveDocumentDesign, type TemplateDocumentType } from "@/lib/document-design";
import { documentPageRule } from "@/lib/document-print";
import { createA4PdfBlob, documentPdfFileName, downloadPdfBlob, savePdfBlob } from "@/lib/document-output";
import { CustomInvoiceTemplate, TEMPLATE_WIDTH_PX, pageStampAreaMm, type TemplateBranding } from "./custom-invoice-template";
import { InvoicePackingListDialog } from "./invoice-packing-list";
import { DeliveryNoteTemplate } from "./delivery-note-template";
import { toast } from "sonner";
import { customerInvoiceLines, inventoryInvoiceLines } from "@/lib/invoice-stock-lines";
import { letterheadForDocument } from "@/lib/letterhead";
import { transactionDocumentData, type CompanyBranding } from "./layout-builder/company-data";
import type { DocumentStamp } from "@/lib/layout/document-data";
import { LayoutPreview } from "./layout-builder/layout-preview";
import { printLayout } from "./layout-builder/print-layout";
import { bankForCurrency, bankLines } from "@/lib/bank-accounts";
import { vendorBankLines } from "@/lib/vendor-bank";
import { contentBox, parseLayoutCollection } from "@/lib/layout/schema";
import { PAGE_STAMP_SIZE, clampPageStamp, type MovePageStamp } from "./page-stamps";
import { readStampPositions, type DocumentStampPositions, type StampPlacement, type StampPositions } from "@/lib/stamp-positions";

type RecordData = Record<string, string | number | boolean>;
type Branding = TemplateBranding & CompanyBranding & { id?: number; documentDesign?: string; letterheadDesign?: string; documentLayout?: string; stampPositions?: string };
export const salesDocumentTitles = {
  "tax-invoice": "Tax Invoice",
  "commercial-invoice": "Commercial Invoice",
  estimate: "Estimate",
  "proforma-invoice": "Proforma Invoice",
  "sales-order": "Sales Order",
  bill: "Supplier Bill",
  "purchase-order": "Purchase Order",
  "purchase-return": "Purchase Return",
  "credit-note": "Credit Note",
  refund: "Refund",
  quotation: "Quotation",
  "cash-sales": "Sales Receipt",
  "delivery-note": "Delivery Note",
  "packing-list": "Packing List",
  "hs-code-summary": "HS Code Summary",
} as const;
export type SalesDocumentMode = keyof typeof salesDocumentTitles;

const savedTemplateType: Partial<Record<SalesDocumentMode, TemplateDocumentType>> = {
  "tax-invoice": "Invoice",
  "commercial-invoice": "Commercial Invoice",
  quotation: "Quotation",
  estimate: "Estimate",
  "proforma-invoice": "Proforma Invoice",
  "sales-order": "Sales Order",
  bill: "Bill",
  "purchase-order": "Purchase Order",
  "purchase-return": "Purchase Return",
  "credit-note": "Credit Note",
  refund: "Refund",
  "cash-sales": "Sales Receipt",
  "delivery-note": "Delivery Note",
  "packing-list": "Packing List",
};

const relatedDocumentOutputs: Partial<Record<SalesDocumentMode, SalesDocumentMode[]>> = {
  "tax-invoice": ["tax-invoice", "commercial-invoice", "delivery-note", "packing-list", "hs-code-summary"],
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
    case "bill": return "bill";
    case "purchase order": return "purchase-order";
    case "vendor credit":
    case "purchase return": return "purchase-return";
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
export function SalesDocumentTemplate({ mode, record, lines, contact, setup, onStampPositionsSaved }: { mode: SalesDocumentMode; record: RecordData; lines: RecordData[]; contact?: RecordData | null; setup: Branding; onStampPositionsSaved?: (stampPositions: string) => void; showBillingName: boolean; showShipping: boolean; showHsCode: boolean; showDimensions: boolean }) {
  const outputModes = relatedDocumentOutputs[mode] ?? [mode];
  const [selection, setSelection] = useState<{ source: SalesDocumentMode; output: SalesDocumentMode }>({ source: mode, output: mode });
  const [copy, setCopy] = useState<"customer" | "inventory">("customer");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showBank, setShowBank] = useState(true);
  // Stamp placement is saved per document type; unsaved edits are kept per type until saved.
  const [savedPositions, setSavedPositions] = useState(() => readStampPositions(setup.stampPositions));
  const [stampEdits, setStampEdits] = useState<StampPositions>({});
  const [savingStamps, setSavingStamps] = useState(false);
  // The bank box remark defaults to the account's remark from Company Setup; edits here apply to this document only.
  const [bankRemarkEdit, setBankRemarkEdit] = useState<string | null>(null);
  const [packingOpen, setPackingOpen] = useState(false);
  const [packingView, setPackingView] = useState<"packing" | "hs-summary">("packing");
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const connectedPackingList = String(record.type) === "invoice";
  const activeMode = selection.source === mode && outputModes.includes(selection.output) ? selection.output : mode;
  const signedInvoiceCopies = activeMode === "tax-invoice" || activeMode === "commercial-invoice";
  const letterhead = letterheadForDocument(setup.letterheadDesign, activeMode);
  // Only positions saved as page coordinates count; older strip positions fall back to the defaults.
  const savedStamps = savedPositions[activeMode] ?? {};
  const savedCompany = savedStamps.company?.page ? savedStamps.company : undefined;
  const savedBank = savedStamps.bank?.page ? savedStamps.bank : undefined;
  const movableStamp = true;
  // The company's bank details belong on customer documents asking for payment: not on delivery notes,
  // packing lists or HS summaries, and not on purchase documents (bills, purchase orders, purchase returns).
  const bankApplies = !["delivery-note", "packing-list", "hs-code-summary", "bill", "purchase-order", "purchase-return"].includes(activeMode);
  // The movable bank details box is also offered on delivery notes (off by default); their template bank block stays off.
  // Purchase orders and bills offer the supplier's own bank details (saved on the vendor) in the same movable box.
  const supplierBankMode = activeMode === "purchase-order" || activeMode === "bill";
  const bankBoxApplies = bankApplies || activeMode === "delivery-note" || supplierBankMode;
  const requestedTemplateType = savedTemplateType[activeMode];
  const { design, savedTemplate } = resolveDocumentDesign(setup.documentDesign, requestedTemplateType);
  if (!savedTemplate || savedTemplate.appliesToAll || (requestedTemplateType && savedTemplate.type !== requestedTemplateType)) design.title = salesDocumentTitles[activeMode];
  if (activeMode === "purchase-return") design.headers = [...design.headers.filter((field) => field.key !== "source"), { key: "source", label: "Original Supplier Bill", width: 1, screen: true, print: true }];

  const a4Design = { ...design, paper: "A4" as const, printerMode: "specified" as const, orientation: printOrientation };
  // Each document type prints with its own Layout Builder design when the company has turned it on.
  const builderLayout = useMemo(() => {
    const type = savedTemplateType[activeMode];
    if (!type || !setup.documentLayout) return null;
    try {
      const layout = parseLayoutCollection(setup.documentLayout)[type];
      if (!layout?.enabled) return null;
      if (showBank) return layout;
      // Turning bank details off hides the layout's bank section on screen, print and PDF.
      return { ...layout, rows: layout.rows.map((row) => ({ ...row, sections: row.sections.map((section) => section.type === "bankDetails" ? { ...section, screen: false, print: false } : section) })) };
    } catch { return null; }
  }, [activeMode, setup.documentLayout, showBank]);
  // Stamps sit anywhere on the first page, in millimetres from the printable area's top-left corner.
  const stampArea = builderLayout ? contentBox(builderLayout.page) : pageStampAreaMm(a4Design);
  // Stamps start switched off unless positions were saved for this document type; tick them when needed.
  const stamp = stampEdits[activeMode]?.company ?? savedCompany ?? { show: false, left: stampArea.width - 40, top: stampArea.height - 30, page: true };
  const bankBox = stampEdits[activeMode]?.bank ?? savedBank ?? { show: false, left: 0, top: stampArea.height - 60, page: true };
  const editStamps = (patch: DocumentStampPositions) => setStampEdits((edits) => ({ ...edits, [activeMode]: { company: stamp, bank: bankBox, ...edits[activeMode], ...patch } }));
  const setPoStamp = (company: StampPlacement) => editStamps({ company: { ...company, page: true } });
  const setBankBox = (bank: StampPlacement) => editStamps({ bank: { ...bank, page: true } });
  const movePageStamp: MovePageStamp = (kind, left, top) => kind === "bank" ? setBankBox({ ...bankBox, left, top }) : setPoStamp({ ...stamp, left, top });
  const companyPlacement = { ...stamp, ...clampPageStamp("company", stamp.left, stamp.top, stampArea.width, stampArea.height) };
  const bankPlacement = { ...bankBox, ...clampPageStamp("bank", bankBox.left, bankBox.top, stampArea.width, stampArea.height) };
  const documentCurrency = String(record.currency || setup.baseCurrency || "").toUpperCase();
  // The bank box shows the account for the document currency, typed in Company Setup, plus its remark.
  const bankAccount = bankBoxApplies && !supplierBankMode ? bankForCurrency(setup, documentCurrency) : null;
  const supplierName = String(contact?.company || contact?.name || record.party || "supplier");
  const supplierBankLines = supplierBankMode ? vendorBankLines(contact ?? {}) : [];
  const bankBoxLines = supplierBankMode ? (supplierBankLines.length ? supplierBankLines : null) : bankAccount ? bankLines(bankAccount) : null;
  const bankBoxTitle = supplierBankMode ? "Supplier bank details" : "Bank details";
  const bankRemark = bankRemarkEdit ?? (supplierBankMode ? "" : bankAccount?.remark ?? "");
  const bankBoxShown = Boolean(bankBoxLines) && bankBox.show;
  const pageStamps: DocumentStamp[] = [
    ...(companyPlacement.show && setup.stampData ? [{ kind: "company" as const, src: setup.stampData, left: companyPlacement.left, top: companyPlacement.top }] : []),
    ...(bankBoxShown && bankBoxLines ? [{ kind: "bank" as const, title: bankBoxTitle, lines: bankBoxLines, remark: bankRemark, src: supplierBankMode ? undefined : bankAccount?.stampData, left: bankPlacement.left, top: bankPlacement.top }] : []),
  ];
  const stampsToSave: DocumentStampPositions = { company: { show: stamp.show, left: companyPlacement.left, top: companyPlacement.top, page: true }, bank: { show: bankBox.show, left: bankPlacement.left, top: bankPlacement.top, page: true } };
  const stampsDirty = JSON.stringify(stampsToSave) !== JSON.stringify({ company: savedCompany, bank: savedBank });
  // Saves one document type's stamp settings; also used by the invoice packing-list window.
  const persistStampPositions = async (type: string, entry: DocumentStampPositions, label: string) => {
    if (!setup.id) return false;
    setSavingStamps(true);
    try {
      const next = { ...savedPositions, [type]: entry };
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: setup.id, stampPositions: JSON.stringify(next) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the stamp positions.");
      const stored = String(result.record?.stampPositions ?? JSON.stringify(next));
      setSavedPositions(readStampPositions(stored));
      onStampPositionsSaved?.(stored);
      toast.success(`Stamp positions saved for every ${label}`);
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the stamp positions."); return false; }
    finally { setSavingStamps(false); }
  };
  const saveStampPositions = async () => {
    if (await persistStampPositions(activeMode, stampsToSave, salesDocumentTitles[activeMode])) setStampEdits((edits) => Object.fromEntries(Object.entries(edits).filter(([type]) => type !== activeMode)));
  };
  const pageRule = documentPageRule(a4Design);
  const screenPreviewRef = useRef<HTMLDivElement>(null);
  // The template renders at its fixed design width; on narrow screens the preview zooms out to fit.
  // Print and PDF temporarily restore true size so their measurements and output are unaffected.
  const fitRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  useLayoutEffect(() => {
    const host = fitRef.current;
    if (!host) return;
    const measure = () => setPreviewZoom(Math.min(1, Math.max(0.35, host.clientWidth / TEMPLATE_WIDTH_PX)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const atTrueSize = async <T,>(work: () => T | Promise<T>) => {
    const zoomed = zoomRef.current;
    const previous = zoomed?.style.zoom ?? "";
    if (zoomed) zoomed.style.zoom = "1";
    try { return await work(); } finally { if (zoomed) zoomed.style.zoom = previous; }
  };
  const alternatePreviewRef = useRef<HTMLDivElement>(null);
  const splitInvoiceCopies = connectedPackingList && signedInvoiceCopies;
  const selectedCopy = splitInvoiceCopies ? copy : "customer";
  const customerLines = connectedPackingList ? customerInvoiceLines(lines) : lines;
  const inventoryLines = inventoryInvoiceLines(lines);
  const renderDocument = (documentCopy: "customer" | "inventory", print = false) => {
    const inventoryCopy = splitInvoiceCopies && documentCopy === "inventory";
    const withoutBank = !bankApplies || !showBank;
    const copyDesign = { ...a4Design, ...(inventoryCopy ? { title: `${design.title} — Inventory Copy` } : {}), ...(withoutBank ? { footer: a4Design.footer.filter((field) => field.key !== "bankDetails") } : {}) };
    const copyLines = inventoryCopy ? inventoryLines : customerLines;
    return activeMode === "delivery-note" && connectedPackingList && !design.enabled
      ? <DeliveryNoteTemplate record={record} lines={copyLines} contact={contact} setup={setup} letterhead={letterhead} stampOverride={{ show: false, left: 0, top: 0 }} pageStamps={pageStamps} pageStampArea={stampArea} onMovePageStamp={!print ? movePageStamp : undefined} />
      : <CustomInvoiceTemplate design={copyDesign} record={record} lines={copyLines} contact={contact} setup={setup} letterhead={design.enabled ? undefined : letterhead} stampOverride={{ show: false, left: 0, top: 0 }} stampPlacement="footer" showBankStamp={false} pageStamps={pageStamps} onMovePageStamp={!print ? movePageStamp : undefined} showItemNumberAtEnd={inventoryCopy} target="print" onMoveStamp={!print && movableStamp ? (left, top) => setPoStamp({ ...stamp, left, top }) : undefined} />;
  };
  const customerName = String(contact?.billingName || contact?.company || record.party || "Customer");
  const referenceNumber = String(record.number || "Document");
  const pdfFileName = documentPdfFileName(customerName, selectedCopy === "inventory" ? `${referenceNumber}_Inventory_Copy` : referenceNumber);
  const pdfTitle = pdfFileName.replace(/\.pdf$/i, "");
  const pdfElement = () => screenPreviewRef.current?.querySelector<HTMLElement>(".custom-invoice") || null;
  const builderCopies = (() => {
    if (!builderLayout) return null;
    const documentData = (documentLines: RecordData[]) => {
      const data = transactionDocumentData(record, documentLines, contact, setup);
      // Layout Builder documents get the same freely placed company stamp and bank details box.
      return { ...data, stamps: pageStamps, company: { ...data.company, bank: { ...data.company.bank, stamp: "" } } };
    };
    const customer = documentData(customerLines);
    if (!signedInvoiceCopies) return { preview: customer, print: [{ data: customer }] };
    // Signed invoices print a customer copy and an inventory-team copy, each starting on its own page.
    const inventory = documentData(inventoryLines);
    return { preview: selectedCopy === "inventory" ? inventory : customer, print: [{ data: customer, label: "CUSTOMER COPY" }, { data: inventory, label: "INVENTORY TEAM COPY" }] };
  })();
  const printWithBuilder = (pdf: boolean) => {
    if (!builderLayout || !builderCopies) return false;
    if (pdf) toast.info("Choose “Save as PDF” as the destination in the print dialog.");
    void printLayout(builderLayout, builderCopies.print, pdfTitle).catch((error: Error) => toast.error(error.message));
    return true;
  };

  const printA4 = () => {
    if (printWithBuilder(false)) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print this document.");
    popup.opener = null;
    const portrait = a4Design.orientation !== "landscape";
    const pageWidthMm = portrait ? 210 : 297;
    const pageHeightMm = portrait ? 297 : 210;
    const printableWidthPx = Math.max(1, (pageWidthMm - a4Design.margin * 2) * 96 / 25.4);
    const printableHeightPx = Math.max(1, (pageHeightMm - a4Design.margin * 2) * 96 / 25.4);
    const signingSpace = signedInvoiceCopies ? 82 : 0;
    const customerPreview = splitInvoiceCopies && selectedCopy === "inventory" ? alternatePreviewRef : screenPreviewRef;
    const inventoryPreview = splitInvoiceCopies && selectedCopy === "customer" ? alternatePreviewRef : screenPreviewRef;
    const copySources = signedInvoiceCopies
      ? [{ label: "CUSTOMER COPY", ref: customerPreview }, { label: "INVENTORY TEAM COPY", ref: inventoryPreview }]
      : Array.from({ length: a4Design.copies }, () => ({ label: "", ref: screenPreviewRef }));
    if (copySources.some(({ ref }) => !ref.current?.querySelector(".custom-invoice"))) {
      popup.close(); return toast.error("Document preview is not ready.");
    }
    const zoomed = zoomRef.current;
    const previousZoom = zoomed?.style.zoom ?? "";
    if (zoomed) zoomed.style.zoom = "1";
    const copies = copySources.map(({ label, ref }) => {
      const invoice = ref.current!.querySelector<HTMLElement>(".custom-invoice")!;
      const source = ref.current!.innerHTML;
      const rect = invoice.getBoundingClientRect();
      const sourceWidth = Math.max(1, Math.ceil(Math.max(rect.width, invoice.scrollWidth)));
      const sourceHeight = Math.max(1, Math.ceil(Math.max(rect.height, invoice.scrollHeight)));
      const scale = Math.min(1, printableWidthPx / sourceWidth, (printableHeightPx - signingSpace) / sourceHeight);
      return `<section class="print-copy" style="width:${printableWidthPx}px;height:${printableHeightPx}px">${label ? `<div class="copy-label">${label}</div>` : ""}<div class="print-fit" style="top:${label ? 30 : 0}px;width:${sourceWidth}px;transform:scale(${scale});transform-origin:top left">${source}</div>${label ? `<div class="copy-signature"><span>Received by: ____________________</span><span>Signature: ____________________</span><span>Date: ____________________</span></div>` : ""}</section>`;
    }).join("");
    if (zoomed) zoomed.style.zoom = previousZoom;
    const pageNumbers = a4Design.printPageNumbers ? '@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px Arial,sans-serif;color:#475569;}' : "";

    popup.document.write(`<!doctype html><html><head><title>${pdfTitle}</title><style>
      @page{size:A4 ${a4Design.orientation};margin:${a4Design.margin}mm;${pageNumbers}}
      html,body{margin:0;padding:0;background:#fff}
      .print-toolbar{position:sticky;top:0;z-index:9999;display:flex;justify-content:flex-end;gap:8px;padding:10px;background:#0f172a}
      .print-toolbar button{border:1px solid #64748b;border-radius:8px;background:#fff;color:#0f172a;padding:8px 14px;font:600 14px Arial,sans-serif;cursor:pointer}
      .print-copy{break-after:page;position:relative;overflow:visible}
      .print-copy:last-child{break-after:auto}
      .print-fit{position:relative}
      .copy-label{position:absolute;right:0;top:0;z-index:2;border:1px solid #0f172a;border-radius:999px;padding:5px 11px;color:#0f172a;font:700 11px Arial,sans-serif;letter-spacing:.08em}
      .copy-signature{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:1.2fr 1fr .8fr;gap:18px;border-top:1px solid #94a3b8;padding-top:12px;color:#334155;font:600 11px Arial,sans-serif}
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
    if (printWithBuilder(true)) return;
    const target = pdfElement();
    if (!target) return toast.error("Document preview is not ready.");
    setPdfBusy(true);
    try {
      const blob = await atTrueSize(() => createA4PdfBlob(target, { orientation: a4Design.orientation, marginMm: a4Design.margin, title: pdfTitle }));
      await savePdfBlob(blob, pdfFileName);
      toast.success(`PDF saved as ${pdfFileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (printWithBuilder(true)) return;
    const target = pdfElement();
    if (!target) return toast.error("Document preview is not ready.");
    setPdfBusy(true);
    try {
      const blob = await atTrueSize(() => createA4PdfBlob(target, { orientation: a4Design.orientation, marginMm: a4Design.margin, title: pdfTitle }));
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
    <div className="document-internal-only mb-4 grid gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
      {outputModes.length > 1 ? <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document layout</span>
        {outputModes.map((outputMode) => {
          const packingLinked = connectedPackingList && (outputMode === "packing-list" || outputMode === "hs-code-summary");
          return <Button key={outputMode} type="button" size="sm" variant={activeMode === outputMode && !packingLinked ? "default" : "outline"} aria-pressed={activeMode === outputMode} onClick={() => {
            if (packingLinked) {
              setPackingView(outputMode === "hs-code-summary" ? "hs-summary" : "packing");
              setPackingOpen(true);
              return;
            }
            setSelection({ source: mode, output: outputMode });
          }}>{salesDocumentTitles[outputMode]}</Button>;
        })}
      </div> : <div />}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {splitInvoiceCopies && <div className="flex w-full flex-wrap gap-2" aria-label="Invoice copy">
          <Button type="button" variant={copy === "customer" ? "default" : "outline"} aria-pressed={copy === "customer"} onClick={() => setCopy("customer")}>Customer Copy</Button>
          <Button type="button" variant={copy === "inventory" ? "default" : "outline"} aria-pressed={copy === "inventory"} onClick={() => setCopy("inventory")}>Inventory Copy</Button>
        </div>}
        {builderLayout ? <span className="text-xs font-medium text-muted-foreground">Layout Builder design · {builderLayout.page.size} {builderLayout.page.orientation}</span> : <PrintOrientationSelect value={printOrientation} onValueChange={setPrintOrientation} />}
        <Button type="button" variant="outline" onClick={printA4}>
          <Printer className="size-4" />{signedInvoiceCopies ? "Print 2 A4 copies" : "Print A4"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void savePdf()} disabled={pdfBusy}>
          <FileDown className="size-4" />{pdfBusy ? "Preparing…" : "Save as PDF"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void downloadPdf()} disabled={pdfBusy}>
          <Download className="size-4" />Download
        </Button>
      </div>
    </div>
    {movableStamp && <div className="document-internal-only mb-4 grid gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={stamp.show} disabled={!setup.stampData} onChange={(event) => setPoStamp({ ...stamp, show: event.target.checked })} />Company stamp</label>{bankApplies && <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={showBank} onChange={(event) => setShowBank(event.target.checked)} />Bank account details</label>}{bankBoxApplies && <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={bankBoxShown} disabled={!bankBoxLines} onChange={(event) => setBankBox({ ...bankBox, show: event.target.checked })} />{supplierBankMode ? `Supplier bank details (${supplierName})` : `Bank details box (${documentCurrency})`}</label>}{!setup.stampData && <span className="text-muted-foreground">Upload a company stamp in Company Setup first.</span>}{bankBoxApplies && !bankBoxLines && <span className="text-muted-foreground">{supplierBankMode ? "No bank details saved for this supplier. Add them in Vendor Center → Edit." : `Add a ${documentCurrency} bank account in Company Setup → Bank account.`}</span>}{(setup.stampData || bankAccount) && setup.id ? <Button type="button" size="sm" variant={stampsDirty ? "default" : "outline"} className="ml-auto" disabled={savingStamps || !stampsDirty} onClick={() => void saveStampPositions()}><Save className="size-4" />{savingStamps ? "Saving…" : stampsDirty ? "Save stamp positions" : "Positions saved"}</Button> : null}</div>
      {companyPlacement.show && setup.stampData && <div className="flex flex-wrap items-center gap-4"><span className="w-32 font-medium">Company stamp</span><label className="flex items-center gap-2">Left (mm)<input type="number" min="0" max={Math.floor(stampArea.width - PAGE_STAMP_SIZE.company.width)} className="h-9 w-24 rounded-md border bg-background px-3 text-foreground" value={companyPlacement.left} onChange={(event) => setPoStamp({ ...stamp, left: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="flex items-center gap-2">Top (mm)<input type="number" min="0" max={Math.floor(stampArea.height - PAGE_STAMP_SIZE.company.height)} className="h-9 w-24 rounded-md border bg-background px-3 text-foreground" value={companyPlacement.top} onChange={(event) => setPoStamp({ ...stamp, top: Math.max(0, Number(event.target.value) || 0) })} /></label></div>}
      {bankBoxShown && <div className="flex flex-wrap items-center gap-4"><span className="w-32 font-medium">{supplierBankMode ? "Supplier bank box" : `Bank box (${documentCurrency})`}</span><label className="flex items-center gap-2">Left (mm)<input type="number" min="0" max={Math.floor(stampArea.width - PAGE_STAMP_SIZE.bank.width)} className="h-9 w-24 rounded-md border bg-background px-3 text-foreground" value={bankPlacement.left} onChange={(event) => setBankBox({ ...bankBox, left: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="flex items-center gap-2">Top (mm)<input type="number" min="0" max={Math.floor(stampArea.height - PAGE_STAMP_SIZE.bank.height)} className="h-9 w-24 rounded-md border bg-background px-3 text-foreground" value={bankPlacement.top} onChange={(event) => setBankBox({ ...bankBox, top: Math.max(0, Number(event.target.value) || 0) })} /></label></div>}
      {bankBoxShown && <label className="grid gap-1"><span className="font-medium">{supplierBankMode ? "Note on this document" : "Remark on this document"}</span><textarea rows={2} maxLength={500} className="w-full rounded-md border bg-background px-3 py-2 text-foreground" value={bankRemark} placeholder="Payment note, correspondent bank instructions…" onChange={(event) => setBankRemarkEdit(event.target.value)} /><span className="text-xs text-muted-foreground">{supplierBankMode ? "Optional note printed under the supplier's bank details, for this document only." : <>Starts with the {documentCurrency} account&apos;s remark from Company Setup. Changes here apply to this document only.</>}</span></label>}
      {companyPlacement.show && setup.stampData || bankBoxShown ? <span className="text-xs text-muted-foreground">Drag the company stamp and the bank box anywhere on the first page, or type Left / Top in mm from the top-left of the printable area. {supplierBankMode ? "The supplier bank box shows the bank details saved on this vendor." : <>The bank box shows the {documentCurrency} account from Company Setup.</>} Save stamp positions to use these settings on every {salesDocumentTitles[activeMode]}.</span> : null}
    </div>}
    {signedInvoiceCopies ? <div className="document-internal-only mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">Print creates Customer and Inventory copies with signature areas. Customer copies hide zero-price and stock-return lines. Save or download uses the selected copy.</div> : null}
    <div ref={fitRef} className="relative min-w-0">
      {builderLayout && builderCopies ? <LayoutPreview layout={builderLayout} data={builderCopies.preview} onMoveStamp={movePageStamp} /> : <div ref={zoomRef} style={{ zoom: previewZoom }}><div ref={screenPreviewRef} className="invoice-screen-only" data-invoice-copy={selectedCopy}>{renderDocument(selectedCopy)}</div></div>}
      {splitInvoiceCopies && <div ref={alternatePreviewRef} data-invoice-copy={selectedCopy === "customer" ? "inventory" : "customer"} className="invoice-screen-only pointer-events-none absolute top-0 w-full" style={{ left: -100000 }} aria-hidden="true" inert>{renderDocument(selectedCopy === "customer" ? "inventory" : "customer")}</div>}
    </div>
    <div className="invoice-print-only">{renderDocument(selectedCopy, true)}</div>
    {connectedPackingList ? <InvoicePackingListDialog open={packingOpen} onOpenChange={setPackingOpen} companyId={Number(record.companyId)} companyName={String(setup.name || "Company")} setup={setup} invoiceId={Number(record.id)} initialView={packingView} stampPositions={savedPositions} onSaveStampPositions={setup.id && (setup.stampData || bankForCurrency(setup, documentCurrency)) ? persistStampPositions : undefined} savingStampPositions={savingStamps} /> : null}
  </>;
}
