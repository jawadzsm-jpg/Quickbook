import { resolveDocumentDesign, type TemplateDocumentType } from "@/lib/document-design";
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
    default: return null;
  }
}

// Each transaction type resolves its own active saved Company Setup template.
// If no type-specific template exists, the company default design remains the fallback.
export function SalesDocumentTemplate({ mode, record, lines, contact, setup }: { mode: SalesDocumentMode; record: RecordData; lines: RecordData[]; contact?: RecordData | null; setup: Branding; showBillingName: boolean; showShipping: boolean; showHsCode: boolean; showDimensions: boolean }) {
  const { design, savedTemplate } = resolveDocumentDesign(setup.documentDesign, savedTemplateType[mode]);
  if (!savedTemplate) design.title = salesDocumentTitles[mode];
  return <>
    <style>{`@page{size:${design.paper} ${design.orientation};margin:${design.margin}mm}.invoice-print-only{display:none}@media print{body:has(.custom-invoice) .document-print-surface{padding:0!important}.invoice-screen-only{display:none!important}.invoice-print-only{display:block!important}}`}</style>
    <div className="invoice-screen-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} /></div>
    <div className="invoice-print-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} target="print" /></div>
  </>;
}
