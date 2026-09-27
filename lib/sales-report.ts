export const salesReportKeys = new Set([
  "daily-sales-summary",
  "daily-sales-detail",
  "sales-by-customer",
  "sales-by-customer-detail",
  "sales-by-item",
  "sales-by-item-detail",
  "sales-by-rep-summary",
  "sales-by-rep-detail",
  "sales-by-ship-to",
  "sales-graph",
  "pending-sales",
  "sales-orders",
]);

export type SalesSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type SalesReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const sum = (rows: SalesReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: SalesReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const moneyCard = (label: string, value: number, tone: SalesSummaryCard["tone"] = "neutral"): SalesSummaryCard => ({ label, value, format: "money", tone });
const numberCard = (label: string, value: number): SalesSummaryCard => ({ label, value, format: "number", tone: "neutral" });

export function salesDetailTarget(key = "") {
  return ({
    "daily-sales-summary": "daily-sales-detail",
    "sales-by-customer": "sales-by-customer-detail",
    "sales-by-item": "sales-by-item-detail",
    "sales-by-rep-summary": "sales-by-rep-detail",
    "sales-by-ship-to": "sales-by-customer-detail",
    "sales-graph": "daily-sales-detail",
  } as Record<string, string>)[key] || "";
}

export function salesSummary(report: SalesReportLike): { cards: SalesSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!salesReportKeys.has(key)) return null;

  if (key === "daily-sales-summary") {
    return { cards: [moneyCard("Net sales", sum(rows, "sales"), "positive"), moneyCard("VAT", sum(rows, "vat")), moneyCard("Gross total", sum(rows, "total"), "accent"), numberCard("Documents", sum(rows, "documents")), numberCard("Quantity sold", sum(rows, "quantity"))], note: "Daily totals include posted invoices and sales receipts in home currency." };
  }
  if (key === "sales-by-customer-detail") {
    return { cards: [moneyCard("Net sales", sum(rows, "amount"), "positive"), moneyCard("VAT", sum(rows, "vat")), moneyCard("Gross total", sum(rows, "total"), "accent"), numberCard("Documents", rows.length), numberCard("Customers", unique(rows, "customer"))], note: "Select an underlined document number to open the source sale, or select a customer to open its account area." };
  }
  if (key === "sales-by-customer") {
    const total = sum(rows, "amount");
    return { cards: [moneyCard("Net sales", total, "positive"), numberCard("Customers", rows.length), moneyCard("Average per customer", rows.length ? total / rows.length : 0), moneyCard("Top customer sales", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))), "accent")], note: "Customer totals show posted sales before VAT. Select a customer to open its linked customer area." };
  }
  if (key === "sales-by-item" || key === "sales-by-item-detail") {
    const quantity = sum(rows, "quantity");
    const sales = sum(rows, "amount");
    return { cards: [moneyCard("Net sales", sales, "positive"), numberCard("Quantity sold", quantity), numberCard(key === "sales-by-item" ? "Items" : "Sales lines", rows.length), moneyCard("Average unit value", quantity ? sales / quantity : 0)], note: "Select an underlined source number to open the originating sales document." };
  }
  if (key === "sales-by-rep-summary" || key === "sales-by-rep-detail") {
    const sales = sum(rows, "amount");
    const documents = key === "sales-by-rep-summary" ? sum(rows, "documents") : rows.length;
    return { cards: [moneyCard("Net sales", sales, "positive"), numberCard("Sales reps", unique(rows, "salesman")), numberCard("Documents", documents), moneyCard("Average per document", documents ? sales / documents : 0)], note: "Sales performance is grouped by the sales representative saved on each posted sales document." };
  }
  if (key === "sales-by-ship-to") {
    const sales = sum(rows, "amount");
    return { cards: [moneyCard("Net sales", sales, "positive"), numberCard("Destinations", rows.length), numberCard("Customers", sum(rows, "customers")), numberCard("Documents", sum(rows, "documents"))], note: "Destinations use the country or address saved on the linked customer record." };
  }
  if (key === "sales-graph") {
    const sales = sum(rows, "sales");
    const refunds = sum(rows, "refunds");
    return { cards: [moneyCard("Gross sales", sales, "positive"), moneyCard("Refunds", refunds, refunds > 0 ? "negative" : "neutral"), moneyCard("Net sales", sales - refunds, "accent"), numberCard("Months", rows.length)], note: "The chart compares monthly posted sales with credit memo refunds for the selected period." };
  }
  if (key === "pending-sales") {
    const overdue = rows.filter((row) => String(row.dueDate || "") !== "—" && String(row.dueDate || "") < new Date().toISOString().slice(0, 10)).length;
    return { cards: [moneyCard("Pending value", sum(rows, "amount"), "accent"), numberCard("Open documents", rows.length), numberCard("Customers", unique(rows, "customer")), { label: "Past due", value: overdue, format: "number", tone: overdue ? "negative" : "positive" }], note: "Select an underlined document number to review or continue the originating sales workflow." };
  }
  if (key === "sales-orders") {
    return { cards: [moneyCard("Order value", sum(rows, "amount"), "accent"), numberCard("Sales orders", rows.length), numberCard("Customers", unique(rows, "party")), numberCard("Statuses", unique(rows, "status"))], note: "Select an underlined order number to open the linked sales order and fulfilment workflow." };
  }

  const sales = sum(rows, "amount");
  return { cards: [moneyCard("Net sales", sales, "positive"), numberCard("Documents", rows.length), numberCard("Customers", unique(rows, "customer")), numberCard("Sales reps", unique(rows, "salesman"))], note: "Select an underlined document number to open the originating sale." };
}
