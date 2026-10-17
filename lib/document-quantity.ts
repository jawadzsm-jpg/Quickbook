// Total quantity printed under the line items of sales and purchase documents.

const quantityDocumentTypes = new Set(["invoice", "proforma invoice", "estimate", "sales order", "bill", "purchase order"]);

/** Whether a document type shows a Total Qty row with its totals. */
export const showsTotalQuantity = (type: unknown) => quantityDocumentTypes.has(String(type ?? "").toLowerCase());

/** Sum of line quantities; freight-charge lines and lines still pending are left out. Stock returns count negative. */
export function documentTotalQuantity(lines: readonly { quantity?: unknown; isFreightCharge?: unknown; pending?: unknown }[]) {
  const total = lines.reduce((sum, line) => line.isFreightCharge || line.pending ? sum : sum + (Number(line.quantity) || 0), 0);
  return Math.round(total * 1000) / 1000;
}

/** Quantity as printed: grouped thousands, up to three decimals. */
export const formatTotalQuantity = (quantity: number) => quantity.toLocaleString("en-US", { maximumFractionDigits: 3 });
