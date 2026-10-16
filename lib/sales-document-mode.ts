// Which document layout a saved transaction prints with. Kept apart from app/sales-document-template.tsx so the app shell
// can decide this without loading the template (and its PDF, print and layout-builder code) until a document opens.
export type TransactionDocumentMode = "tax-invoice" | "estimate" | "proforma-invoice" | "sales-order" | "bill" | "purchase-order" | "purchase-return" | "credit-note" | "refund" | "cash-sales" | "quotation" | "delivery-note" | "packing-list";

export function salesDocumentModeForTransaction(type: string): TransactionDocumentMode | null {
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
