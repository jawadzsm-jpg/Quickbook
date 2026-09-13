import { defaultDocumentDesign, readDocumentDesign } from "@/lib/document-design";
import { CustomInvoiceTemplate, type TemplateBranding } from "./custom-invoice-template";

type RecordData = Record<string, string | number | boolean>;
type Branding = TemplateBranding & { documentDesign?: string };
export const salesDocumentTitles = {
  "tax-invoice": "Tax Invoice",
  quotation: "Quotation",
  "sales-order": "Sales Order",
  "cash-sales": "Cash Sales",
} as const;
export type SalesDocumentMode = keyof typeof salesDocumentTitles;

// All companies use the Company Setup renderer, including older saved invoices.
// Disabling customization selects its neutral defaults, never the retired template.
export function SalesDocumentTemplate({ mode, record, lines, contact, setup }: { mode: SalesDocumentMode; record: RecordData; lines: RecordData[]; contact?: RecordData | null; setup: Branding; showBillingName: boolean; showShipping: boolean; showHsCode: boolean; showDimensions: boolean }) {
  const saved = readDocumentDesign(setup.documentDesign);
  const design = saved.enabled ? saved : structuredClone(defaultDocumentDesign);
  if (mode !== "tax-invoice") design.title = salesDocumentTitles[mode];
  return <>
    <style>{`@page{size:${design.paper} ${design.orientation};margin:${design.margin}mm}.invoice-print-only{display:none}@media print{body:has(.custom-invoice) .document-print-surface{padding:0!important}.invoice-screen-only{display:none!important}.invoice-print-only{display:block!important}}`}</style>
    <div className="invoice-screen-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} /></div>
    <div className="invoice-print-only"><CustomInvoiceTemplate design={design} record={record} lines={lines} contact={contact} setup={setup} target="print" /></div>
  </>;
}
