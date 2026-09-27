export const vendorReportKeys = new Set([
  "supplier-quickreport",
  "supplier-open-balance",
  "vendor-statements",
  "ap-aging-summary",
  "ap-aging-detail",
  "vendor-balances",
  "supplier-balance-detail",
  "unpaid-bills-detail",
  "accounts-payable-graph",
  "supplier-transactions",
]);

export type VendorSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type VendorReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
  statement?: { opening: number; charges: number; credits: number; closing: number };
};

const sum = (rows: VendorReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: VendorReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const money = (label: string, value: number, tone: VendorSummaryCard["tone"] = "neutral"): VendorSummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: VendorSummaryCard["tone"] = "neutral"): VendorSummaryCard => ({ label, value, format: "number", tone });

export function vendorDetailTarget(key = "") {
  return ({
    "ap-aging-summary": "ap-aging-detail",
    "vendor-balances": "supplier-balance-detail",
    "accounts-payable-graph": "supplier-transactions",
  } as Record<string, string>)[key] || "";
}

export function vendorSummary(report: VendorReportLike): { cards: VendorSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!vendorReportKeys.has(key)) return null;

  if (key === "ap-aging-summary") {
    return { cards: [money("Current", sum(rows, "current")), money("1–30 days", sum(rows, "days30")), money("31–60 days", sum(rows, "days60")), money("61+ days", sum(rows, "days90"), "negative"), money("Total payable", sum(rows, "total"), "accent")], note: "Aging shows remaining supplier bills in the selected transaction currency. Supplier names open Vendor Center." };
  }
  if (key === "ap-aging-detail") {
    return { cards: [money("Open payable", sum(rows, "amount"), "accent"), number("Open bills", rows.length), number("Suppliers", unique(rows, "supplier")), number("Past due", rows.filter((row) => Number(row.age) > 0).length, "negative")], note: "Select an underlined bill number to open the source purchase document." };
  }
  if (key === "vendor-balances") {
    const total = sum(rows, "amount");
    return { cards: [money("Total payable", total, "accent"), number("Suppliers", rows.length), money("Average balance", rows.length ? total / rows.length : 0), money("Largest balance", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))))], note: "Supplier names open their linked Vendor Center records." };
  }
  if (key === "supplier-balance-detail") {
    const closing = new Map<string, number>();
    rows.forEach((row) => closing.set(String(row.supplier), Number(row.balance ?? 0)));
    return { cards: [money("Bills / charges", sum(rows, "charge")), money("Payments / credits", sum(rows, "payment"), "positive"), money("Closing payable", [...closing.values()].reduce((total, value) => total + value, 0), "accent"), number("Transactions", rows.length)], note: "Document numbers open their source purchase or payment record." };
  }
  if (key === "supplier-open-balance" || key === "unpaid-bills-detail") {
    const ageKey = key === "supplier-open-balance" ? "age" : "overdueDays";
    return { cards: [money("Open payable", sum(rows, "amount"), "accent"), number("Open bills", rows.length), number("Suppliers", unique(rows, "supplier")), number("Past due", rows.filter((row) => Number(row[ageKey]) > 0).length, "negative")], note: "Bill numbers open the original purchase document; supplier names open Vendor Center." };
  }
  if (key === "accounts-payable-graph") {
    return { cards: [money("Bills / charges", sum(rows, "bills")), money("Payments / credits", sum(rows, "payments"), "positive"), money("Closing A/P", Number(rows.at(-1)?.balance ?? 0), "accent"), number("Months", rows.length)], note: "The chart compares monthly supplier charges with payments and credits." };
  }
  if (key === "vendor-statements") {
    return { cards: [money("Opening balance", report.statement?.opening ?? 0), money("Bills / charges", report.statement?.charges ?? 0), money("Payments / credits", report.statement?.credits ?? 0, "positive"), money("Closing balance", report.statement?.closing ?? 0, "accent")], note: "Statement references open their source transactions. Filters preserve vendor, currency and statement dates." };
  }

  const charges = rows.filter((row) => Number(row.amount) > 0).reduce((total, row) => total + Number(row.amount), 0);
  const credits = Math.abs(rows.filter((row) => Number(row.amount) < 0).reduce((total, row) => total + Number(row.amount), 0));
  return { cards: [money("Bills / charges", charges), money("Payments / credits", credits, "positive"), money("Net activity", charges - credits, "accent"), number("Transactions", rows.length), number("Suppliers", unique(rows, "supplier"))], note: "Select a document number to open its source record or a supplier name to open Vendor Center." };
}
