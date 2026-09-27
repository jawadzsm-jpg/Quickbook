export const customerReportKeys = new Set([
  "ar-aging-summary",
  "ar-aging-detail",
  "customer-balances",
  "customers-overdue-invoices",
  "active-customers",
  "customer-open-balance",
  "customer-balance-detail",
  "open-invoices",
  "collections-report",
  "average-days-to-pay-summary",
  "average-days-to-pay-detail",
  "accounts-receivable-graph",
  "unbilled-costs-job",
  "customer-transactions",
  "online-received-payments",
  "customer-statements",
  "customer-document-summary",
]);

export type CustomerSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type CustomerReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
  openBalance?: { totalOpen: number; totalAmount: number; overdueOnly?: boolean };
  activeCustomers?: { count: number };
  statement?: { opening: number; charges: number; credits: number; closing: number };
};

const sum = (rows: CustomerReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: CustomerReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const money = (label: string, value: number, tone: CustomerSummaryCard["tone"] = "neutral"): CustomerSummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: CustomerSummaryCard["tone"] = "neutral"): CustomerSummaryCard => ({ label, value, format: "number", tone });

export function customerDetailTarget(key = "") {
  return ({
    "ar-aging-summary": "ar-aging-detail",
    "customer-balances": "customer-balance-detail",
    "active-customers": "customer-open-balance",
    "collections-report": "customers-overdue-invoices",
    "average-days-to-pay-summary": "average-days-to-pay-detail",
    "accounts-receivable-graph": "customer-transactions",
    "unbilled-costs-job": "open-purchase-orders-job",
    "online-received-payments": "customer-transactions",
  } as Record<string, string>)[key] || "";
}

export function customerSummary(report: CustomerReportLike): { cards: CustomerSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!customerReportKeys.has(key)) return null;

  if (key === "ar-aging-summary") {
    return { cards: [money("Current", sum(rows, "current")), money("1–30 days", sum(rows, "days30")), money("31–60 days", sum(rows, "days60")), money("61+ days", sum(rows, "days90"), "negative"), money("Total receivable", sum(rows, "total"), "accent")], note: "Aging uses remaining allocated balances in home currency. Select a customer to open its customer area." };
  }
  if (key === "ar-aging-detail") {
    return { cards: [money("Open receivable", sum(rows, "amount"), "accent"), number("Open documents", rows.length), number("Customers", unique(rows, "customer")), number("Past due", rows.filter((row) => Number(row.age) > 0).length, "negative")], note: "Select an underlined document number to open the source transaction." };
  }
  if (key === "customer-balances") {
    const total = sum(rows, "amount");
    return { cards: [money("Total balance", total, "accent"), number("Customers", rows.length), money("Average balance", rows.length ? total / rows.length : 0), money("Largest balance", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))))], note: "Select a customer to open its linked customer and open-balance area." };
  }
  if (key === "customers-overdue-invoices" || key === "customer-open-balance") {
    return { cards: [money(report.openBalance?.overdueOnly ? "Overdue balance" : "Open balance", report.openBalance?.totalOpen ?? sum(rows, "openBalance"), "accent"), money("Original amount", report.openBalance?.totalAmount ?? sum(rows, "amount")), number("Documents", rows.length), number("Customers", unique(rows, "customer"))], note: "Document numbers open the source transaction; receivable accounts open their full Chart of Accounts history." };
  }
  if (key === "active-customers") {
    return { cards: [number("Active customers", report.activeCustomers?.count ?? unique(rows, "customer"), "positive"), number("Currencies", unique(rows, "currency")), number("Overdue invoices", sum(rows, "overdueInvoices"), "negative"), number("Linked accounts", unique(rows.filter((row) => Number(row.accountId) > 0), "account"))], note: "Balances remain in each customer currency. Customer names and receivable accounts open their linked areas." };
  }
  if (key === "customer-balance-detail") {
    const ending = new Map<string, number>();
    rows.forEach((row) => ending.set(String(row.customer), Number(row.balance ?? 0)));
    return { cards: [money("Charges", sum(rows, "charge")), money("Payments / credits", sum(rows, "payment"), "positive"), money("Closing balance", [...ending.values()].reduce((total, value) => total + value, 0), "accent"), number("Transactions", rows.length)], note: "Select an underlined transaction number to open the originating customer document." };
  }
  if (key === "open-invoices") {
    const today = new Date().toISOString().slice(0, 10);
    return { cards: [money("Open invoice value", sum(rows, "amount"), "accent"), number("Open invoices", rows.length), number("Customers", unique(rows, "customer")), number("Past due", rows.filter((row) => String(row.dueDate || "") !== "—" && String(row.dueDate) < today).length, "negative")], note: "Open amounts reflect recorded allocations. Select a number to open its invoice." };
  }
  if (key === "collections-report") {
    return { cards: [money("Amount to collect", sum(rows, "balance"), "accent"), number("Customers", rows.length), number("Open invoices", sum(rows, "openInvoices")), number("Overdue invoices", sum(rows, "overdueInvoices"), "negative")], note: "Customer names open the linked customer area; overdue figures reconcile to open receivables." };
  }
  if (key === "average-days-to-pay-summary" || key === "average-days-to-pay-detail") {
    const invoices = key === "average-days-to-pay-summary" ? sum(rows, "invoices") : rows.length;
    const daysTotal = key === "average-days-to-pay-summary" ? rows.reduce((total, row) => total + Number(row.averageDays ?? 0) * Number(row.invoices ?? 0), 0) : sum(rows, "days");
    return { cards: [number("Average days", invoices ? Math.round(daysTotal / invoices) : 0, "accent"), number("Paid invoices", invoices), number("Customers", unique(rows, "customer")), money("Settled amount", sum(rows, key === "average-days-to-pay-summary" ? "paidAmount" : "amount"), "positive")], note: "Payment timing is calculated from the invoice date to the settlement date." };
  }
  if (key === "accounts-receivable-graph") {
    return { cards: [money("Charges", sum(rows, "charges")), money("Payments / credits", sum(rows, "payments"), "positive"), money("Closing A/R", Number(rows.at(-1)?.balance ?? 0), "accent"), number("Months", rows.length)], note: "The chart compares monthly receivable charges with payments and credits." };
  }
  if (key === "unbilled-costs-job") {
    return { cards: [money("Unbilled cost", sum(rows, "amount"), "accent"), number("Jobs / inventories", rows.length), number("Open documents", sum(rows, "documents")), money("Average per document", sum(rows, "documents") ? sum(rows, "amount") / sum(rows, "documents") : 0)], note: "Open purchase commitments are grouped by their linked inventory or job." };
  }
  if (key === "customer-transactions") {
    const charges = rows.filter((row) => Number(row.amount) > 0).reduce((total, row) => total + Number(row.amount), 0);
    const credits = Math.abs(rows.filter((row) => Number(row.amount) < 0).reduce((total, row) => total + Number(row.amount), 0));
    return { cards: [money("Charges", charges), money("Payments / credits", credits, "positive"), money("Net activity", charges - credits, "accent"), number("Transactions", rows.length)], note: "Select a transaction number to open the source customer document." };
  }
  if (key === "online-received-payments") {
    return { cards: [money("Payments received", sum(rows, "amount"), "positive"), number("Payments", rows.length), number("Customers", unique(rows, "customer")), number("Currencies", unique(rows, "currency"))], note: "Payment numbers open the posted receipt and customer names open the linked customer area." };
  }
  if (key === "customer-statements") {
    return { cards: [money("Opening balance", report.statement?.opening ?? 0), money("Charges", report.statement?.charges ?? 0), money("Payments / credits", report.statement?.credits ?? 0, "positive"), money("Closing balance", report.statement?.closing ?? 0, "accent")], note: "Statement references open their source transactions. Filters preserve customer, currency and statement dates." };
  }
  if (key === "customer-document-summary") {
    return { cards: [number("Estimates", sum(rows, "estimates")), number("Proforma invoices", sum(rows, "proformaInvoices")), number("Sales orders", sum(rows, "salesOrders")), number("Total documents", sum(rows, "totalDocuments"), "accent"), number("Customers", rows.length)], note: "Select a document count to open that customer’s matching sales-document area." };
  }
  return null;
}
