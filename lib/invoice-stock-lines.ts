type Line = { quantity?: unknown; unitPrice?: unknown; itemId?: unknown };
export function isInvoiceStockReturn(line: Line) { return Number(line.quantity) < 0; }
export function validInvoiceQuantity(line: Line) {
  const quantity = Number(line.quantity), price = Number(line.unitPrice);
  return Number.isFinite(quantity) && quantity !== 0 && Number.isFinite(price) && price >= 0 && (quantity > 0 || (Boolean(line.itemId) && price === 0));
}
// Customer amounts remain reconcilable: only zero-priced or stock-return lines are internal.
export function customerInvoiceLines<T extends Line>(lines: T[]) { return lines.filter(line => Number(line.quantity) > 0 && Number(line.unitPrice) !== 0); }
export function inventoryInvoiceLines<T extends Line & { description?: unknown }>(lines: T[]) {
  return lines.map(line => isInvoiceStockReturn(line) ? { ...line, description: `STOCK RETURN (+${Math.abs(Number(line.quantity))} to inventory) · ${String(line.description || "")}` } : line);
}
