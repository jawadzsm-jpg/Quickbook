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
    return { cards: [money("Open payable", sum(rows, "amount"), "accent"), number("Open bills", rows.length), number("Suppliers", new Set(rows.map(vendorSupplier).filter(Boolean)).size), number("Past due", rows.filter((row) => Number(row.age) > 0).length, "negative")], note: "Select an underlined bill number to open the source purchase document." };
  }
  if (key === "vendor-balances") {
    const total = sum(rows, "amount");
    return { cards: [money("Total payable", total, "accent"), number("Suppliers", rows.length), money("Average balance", rows.length ? total / rows.length : 0), money("Largest balance", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))))], note: "Supplier balances include prior activity through the report end date; the From date does not reset balances. Supplier names open Vendor Center." };
  }
  if (key === "supplier-balance-detail") {
    const closing = new Map<string, number>();
    [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.transactionId ?? 0) - Number(b.transactionId ?? 0)).forEach((row) => closing.set(String(row.supplier), Number(row.balance ?? 0)));
    return { cards: [money("Bills / charges", sum(rows, "charge")), money("Payments / credits", sum(rows, "payment"), "positive"), money("Last displayed balance", [...closing.values()].reduce((total, value) => total + value, 0), "accent"), number("Transactions", rows.length)], note: "Running balances retain their original report order and are not summed. Filters select activity; the last displayed balance is not a filtered net total. Document numbers open their source records." };
  }
  if (key === "supplier-open-balance" || key === "unpaid-bills-detail") {
    const ageKey = key === "supplier-open-balance" ? "age" : "overdueDays";
    return { cards: [money("Open payable", sum(rows, "amount"), "accent"), number("Open bills", rows.length), number("Suppliers", new Set(rows.map(vendorSupplier).filter(Boolean)).size), number("Past due", rows.filter((row) => Number(row[ageKey]) > 0).length, "negative")], note: "Bill numbers open the original purchase document; supplier names open Vendor Center." };
  }
  if (key === "accounts-payable-graph") {
    return { cards: [money("Bills / charges", sum(rows, "bills")), money("Payments / credits", sum(rows, "payments"), "positive"), money("Last displayed A/P", Number([...rows].sort((a,b) => String(a.month).localeCompare(String(b.month))).at(-1)?.balance ?? 0), "accent"), number("Months", rows.length)], note: "The chart compares monthly supplier charges with payments and credits." };
  }
  if (key === "vendor-statements") {
    return { cards: [money("Opening balance", report.statement?.opening ?? 0), money("Bills / charges", report.statement?.charges ?? 0), money("Payments / credits", report.statement?.credits ?? 0, "positive"), money("Closing balance", report.statement?.closing ?? 0, "accent")], note: "Statement references open their source transactions. Filters preserve vendor, currency and statement dates." };
  }

  const charges = rows.filter((row) => Number(row.amount) > 0).reduce((total, row) => total + Number(row.amount), 0);
  const credits = Math.abs(rows.filter((row) => Number(row.amount) < 0).reduce((total, row) => total + Number(row.amount), 0));
  return { cards: [money("Bills / charges", charges), money("Payments / credits", credits, "positive"), money("Net activity", charges - credits, "accent"), number("Transactions", rows.length), number("Suppliers", new Set(rows.map(vendorSupplier).filter(Boolean)).size)], note: "Amounts show payable impact: cash-paid expenses and nonposting orders have zero impact. Document numbers open their source records; supplier names open Vendor Center." };
}


export type VendorReportRow = Record<string, string | number | null>;
export type VendorReportColumn = { key: string; label: string; type?: "money" };
export const vendorReportGroups = [
  { title: "Balances & aging", description: "Review outstanding bills and supplier balances in the selected currency.", keys: ["ap-aging-summary", "ap-aging-detail", "vendor-balances", "supplier-balance-detail", "unpaid-bills-detail"] },
  { title: "Supplier activity", description: "Trace documents and payments for an individual supplier or the company.", keys: ["supplier-quickreport", "supplier-open-balance", "supplier-transactions", "vendor-statements"] },
  { title: "Trends", description: "Compare supplier charges with payments and credits over time.", keys: ["accounts-payable-graph"] },
];
export const emptyVendorFilters = { query: "", supplier: "", account: "", status: "", type: "", overdue: false, sort: "default" };
export function vendorSupplier(row: VendorReportRow) { return String(row.supplier ?? row.customer ?? row.name ?? ""); }
export function vendorColumnKind(column: VendorReportColumn) {
  if (/^(quantity|qty|age|overdueDays|documents)$/.test(column.key)) return "quantity";
  if (/^(unitPrice|unitCost|price|rate)$/.test(column.key)) return "price";
  return column.type === "money" ? "amount" : "text";
}
export function vendorColumnWeight(column: VendorReportColumn) {
  if (/^(supplier|customer|name|account|memo|description|item)$/.test(column.key)) return 4;
  if (/^(date|dueDate|number|type|status)$/.test(column.key)) return 2.8;
  return vendorColumnKind(column) === "text" ? 2 : 2.5;
}
export function vendorColumnTotal(rows: VendorReportRow[], column: VendorReportColumn) {
  if (column.key === "balance" || vendorColumnKind(column) === "price" || /^(age|overdueDays)$/.test(column.key)) return null;
  if (column.type !== "money" && !/^(quantity|qty|documents)$/.test(column.key)) return null;
  return rows.reduce((total, row) => total + Number(row[column.key] ?? 0), 0);
}
export function filterVendorReportRows(rows: VendorReportRow[], columns: VendorReportColumn[], filters: typeof emptyVendorFilters) {
  const query = filters.query.trim().toLowerCase();
  const filtered = rows.filter(row => (!query || columns.some(column => String(row[column.key] ?? "").toLowerCase().includes(query))) && (!filters.supplier || vendorSupplier(row) === filters.supplier) && (!filters.account || row.account === filters.account) && (!filters.status || row.status === filters.status) && (!filters.type || row.type === filters.type) && (!filters.overdue || Number(row.age ?? row.overdueDays ?? 0) > 0));
  const amountKey = columns.find(column => ["total", "amount", "charge", "bills", "debit"].includes(column.key))?.key;
  if (filters.sort === "amount" && amountKey) filtered.sort((a,b) => Number(b[amountKey] ?? 0) - Number(a[amountKey] ?? 0));
  if (filters.sort === "name") filtered.sort((a,b) => vendorSupplier(a).localeCompare(vendorSupplier(b)));
  if (filters.sort === "date") filtered.sort((a,b) => String(b.date ?? b.month ?? "").localeCompare(String(a.date ?? a.month ?? "")) || Number(b.transactionId ?? 0) - Number(a.transactionId ?? 0));
  return filtered;
}

// Use posted supplier controls first, then the actual bank/cash settlement account.
// Historical duplicate names are never resolved to a different currency's account.
export function vendorDocumentAccount(transaction: { id: number; type: string; account: string; currency: string }, entries: Array<{ transactionId: number | null; account: string; debit: number; credit: number }>, accounts: Array<{ id: number; code: string; name: string; currency: string; type?: string; systemRole?: string | null }>) {
  const controls = (name: string) => accounts.filter(account => account.name === name && (account.systemRole === "AP" || account.type === "Accounts Payable"));
  const posted = entries.filter(entry => entry.transactionId === transaction.id && (entry.debit !== 0 || entry.credit !== 0));
  const apNames = [...new Set(posted.filter(entry => controls(entry.account).length).map(entry => entry.account))];
  const settlementNames = [...new Set(posted.filter(entry => accounts.some(account => account.name === entry.account && ["Bank", "Cash", "Credit Card"].includes(account.type ?? ""))).map(entry => entry.account))];
  const names = apNames.length ? apNames : settlementNames;
  if (transaction.type === "purchase order") return { account: "Planned · " + (transaction.account || "No saved account"), accountAccountId: 0, accountTransactionId: 0 };
  if (!names.length) return { account: "No posted payable / payment account", accountAccountId: 0, accountTransactionId: 0 };
  if (names.length > 1) return { account: "Multiple posted accounts · open document", accountAccountId: 0, accountTransactionId: transaction.id };
  const candidates = (apNames.length ? controls(names[0]) : accounts.filter(account => account.name === names[0] && ["Bank", "Cash", "Credit Card"].includes(account.type ?? ""))).filter(account => account.currency.toUpperCase() === transaction.currency.toUpperCase());
  const account = candidates.length === 1 ? candidates[0] : undefined;
  return { account: account ? `${account.code} · ${account.name}` : `${names[0]} · account link needs review`, accountAccountId: account?.id ?? 0, accountTransactionId: 0 };
}
