"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveDocumentDesign, type TemplateDocumentType } from "@/lib/document-design";
import { documentPageRule } from "@/lib/document-print";
import { CustomInvoiceTemplate, type TemplateBranding } from "./custom-invoice-template";

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
  "cash-sales": "Cash Sales",
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
    case "credit memo": return "credit-note";
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
  const activeMode = selection.source === mode && outputModes.includes(selection.output) ? selection.output : mode;
  const { design, savedTemplate } = resolveDocumentDesign(setup.documentDesign, savedTemplateType[activeMode]);
  if (!savedTemplate) design.title = salesDocumentTitles[activeMode];

  const a4Design = { ...design, paper: "A4" as const, printerMode: "specified" as const };
  const pageRule = documentPageRule(a4Design);

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
        {outputModes.map((outputMode) => <Button key={outputMode} type="button" size="sm" variant={activeMode === outputMode ? "default" : "outline"} aria-pressed={activeMode === outputMode} onClick={() => setSelection({ source: mode, output: outputMode })}>{salesDocumentTitles[outputMode]}</Button>)}
      </div> : <div />}
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer className="size-4" />Print / Save PDF (A4)
      </Button>
    </div>
    <div className="invoice-screen-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} /></div>
    <div className="invoice-print-only"><CustomInvoiceTemplate design={a4Design} record={record} lines={lines} contact={contact} setup={setup} target="print" /></div>
  </>;
}
