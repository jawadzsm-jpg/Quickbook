export const purchaseReportKeys = new Set([
  "purchases-by-vendor",
  "purchases-by-supplier-detail",
  "purchases-by-item",
  "purchases-by-item-detail",
  "open-purchase-orders",
  "purchase-order-summary",
  "open-purchase-orders-detail",
  "open-purchase-orders-job",
]);

export type PurchaseSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type PurchaseReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const sum = (rows: PurchaseReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: PurchaseReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const money = (label: string, value: number, tone: PurchaseSummaryCard["tone"] = "neutral"): PurchaseSummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: PurchaseSummaryCard["tone"] = "neutral"): PurchaseSummaryCard => ({ label, value, format: "number", tone });

export function purchaseDetailTarget(key = "") {
  return ({
    "purchases-by-vendor": "purchases-by-supplier-detail",
    "purchases-by-item": "purchases-by-item-detail",
    "open-purchase-orders": "open-purchase-orders-detail",
    "purchase-order-summary": "open-purchase-orders",
    "open-purchase-orders-job": "open-purchase-orders-detail",
  } as Record<string, string>)[key] || "";
}

export function purchaseSummary(report: PurchaseReportLike): { cards: PurchaseSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!purchaseReportKeys.has(key)) return null;

  if (key === "purchases-by-vendor") {
    const total = sum(rows, "amount");
    return { cards: [money("Net purchases", total, "accent"), number("Suppliers", rows.length), money("Average per supplier", rows.length ? total / rows.length : 0), money("Largest supplier spend", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))))], note: "Supplier totals include posted bills, received-item bills and purchase expenses before VAT. Select a supplier to open Vendor Center." };
  }
  if (key === "purchases-by-supplier-detail") {
    return { cards: [money("Net purchases", sum(rows, "subtotal"), "accent"), money("Input VAT", sum(rows, "vat")), money("Gross total", sum(rows, "total")), number("Documents", rows.length), number("Suppliers", unique(rows, "supplier"))], note: "Select an underlined document number to open the source bill or expense, or select a supplier to open Vendor Center." };
  }
  if (key === "purchases-by-item" || key === "purchases-by-item-detail") {
    const quantity = sum(rows, "quantity");
    const amount = sum(rows, key === "purchases-by-item" ? "amount" : "total");
    return { cards: [money(key === "purchases-by-item" ? "Net purchases" : "Gross purchases", amount, "accent"), number("Quantity purchased", quantity), number(key === "purchases-by-item" ? "Items" : "Purchase lines", rows.length), money("Average unit value", quantity ? amount / quantity : 0)], note: "Document numbers and latest source references open the originating purchase document." };
  }
  if (key === "purchase-order-summary") {
    return { cards: [number("Total orders", sum(rows, "totalOrders")), number("Open", sum(rows, "open"), "accent"), number("Partially received", sum(rows, "partiallyReceived"), "negative"), number("Fully received", sum(rows, "received"), "positive"), number("Suppliers", rows.filter((row) => Number(row.totalOrders) > 0).length)], note: "Order counts reconcile open, partially received and completed purchase orders. Select a total to open that supplier's purchase-order area." };
  }
  if (key === "open-purchase-orders") {
    return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Open orders", rows.length), number("Suppliers", unique(rows, "supplier")), number("Partially received", rows.filter((row) => String(row.status) === "partially received").length, "negative")], note: "Select a purchase-order number to open the source order; supplier names open Vendor Center." };
  }
  if (key === "open-purchase-orders-detail") {
    return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Open quantity", sum(rows, "quantity")), number("Purchase lines", rows.length), number("Suppliers", unique(rows, "supplier"))], note: "Each underlined PO number opens its original purchase order and receiving workflow." };
  }

  return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Jobs / inventories", rows.length), number("Open orders", sum(rows, "orders")), number("Suppliers", sum(rows, "suppliers"))], note: "Open purchase commitments are grouped by their linked inventory or job; use the detailed report to open source orders." };
}
