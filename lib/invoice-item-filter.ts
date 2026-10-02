type InvoiceItem = Record<string, unknown>;

const invoiceItemTypes = new Set(["service", "stock-part", "non-stock-part", "other-charge"]);

export function isInvoiceItemSelectable(item: InvoiceItem) {
  if (String(item.status || "active") === "inactive") return false;
  const itemType = String(item.itemType || "stock-part");
  if (!invoiceItemTypes.has(itemType)) return false;
  return itemType !== "stock-part" || Number(item.quantity) > 0;
}
