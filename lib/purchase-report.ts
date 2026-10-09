export const purchaseReportKeys = new Set([
  "purchases-by-vendor",
  "purchases-by-supplier-detail",
  "purchases-by-item",
  "purchases-by-item-detail",
  "open-purchase-orders",
  "purchase-order-summary",
  "open-purchase-orders-detail",
  "open-purchase-orders-job",
  "purchases-by-rep-summary",
  "purchases-by-rep-detail",
]);

export type PurchaseReportRow = Record<string, string | number | null>;
export type PurchaseReportColumn = { key: string; label: string; type?: "money" };
export const purchaseReportGroups = [
  { title: "Supplier spending", description: "Review purchases and trace each bill or expense.", keys: ["purchases-by-vendor", "purchases-by-supplier-detail"] },
  { title: "Purchases by sales rep", description: "See which sales rep each bill or expense was entered for, and trace every document.", keys: ["purchases-by-rep-summary", "purchases-by-rep-detail"] },
  { title: "Item purchasing", description: "Compare purchased quantities, unit costs and source documents.", keys: ["purchases-by-item", "purchases-by-item-detail"] },
  { title: "Orders & receiving", description: "Monitor outstanding commitments and receiving progress.", keys: ["purchase-order-summary", "open-purchase-orders", "open-purchase-orders-detail", "open-purchase-orders-job"] },
];
export const emptyPurchaseFilters = { query: "", supplier: "", salesman: "", account: "", status: "", sort: "default" };
export function purchaseColumnKind(column: PurchaseReportColumn): "text" | "quantity" | "price" | "amount" {
  if (column.type === "money") return /cost|price/i.test(column.key) ? "price" : "amount";
  return ["quantity", "returned", "orderedQuantity", "receivedQuantity", "open", "partiallyReceived", "received", "billed", "closed", "totalOrders", "orders", "suppliers", "documents", "overdueDays"].includes(column.key) ? "quantity" : "text";
}
export function purchaseColumnWeight(column: PurchaseReportColumn) {
  if (column.key === "item") return 5;
  if (["name", "supplier", "job", "salesman"].includes(column.key)) return 3.5;
  if (/account/i.test(column.key) || column.key === "sourceReference") return 3;
  if (/date/i.test(column.key)) return 2.2;
  return column.type === "money" ? 2.2 : 1.8;
}
export function purchaseColumnTotal(rows: PurchaseReportRow[], column: PurchaseReportColumn) {
  if (!["quantity", "returned", "orderedQuantity", "receivedQuantity", "open", "partiallyReceived", "received", "billed", "closed", "totalOrders", "orders", "documents", "amount", "purchases", "returns", "freight", "landed", "subtotal", "vat", "total"].includes(column.key)) return null;
  return rows.reduce((total, row) => total + Number(row[column.key] ?? 0), 0);
}
export function purchaseSupplier(row: PurchaseReportRow, key = "") {
  return String(row.supplier ?? (key === "purchases-by-vendor" ? row.name : "") ?? "");
}
export function filterPurchaseReportRows<T extends PurchaseReportRow>(rows: T[], columns: PurchaseReportColumn[], filters: typeof emptyPurchaseFilters, key = "") {
  const query = filters.query.trim().toLocaleLowerCase("en-AE");
  const filtered = rows.filter((row) => (!query || columns.some((column) => String(row[column.key] ?? "").toLocaleLowerCase("en-AE").includes(query))) && (!filters.supplier || purchaseSupplier(row, key) === filters.supplier) && (!filters.salesman || row.salesman === filters.salesman) && (!filters.account || row.account === filters.account) && (!filters.status || row.status === filters.status));
  if (filters.sort === "amount") filtered.sort((a, b) => Number(b.amount ?? b.total ?? b.subtotal ?? 0) - Number(a.amount ?? a.total ?? a.subtotal ?? 0));
  if (filters.sort === "quantity") filtered.sort((a, b) => Number(b.quantity ?? 0) - Number(a.quantity ?? 0));
  if (filters.sort === "date") filtered.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  if (filters.sort === "name") filtered.sort((a, b) => String(a.supplier ?? a.name ?? a.salesman ?? a.item ?? a.job ?? "").localeCompare(String(b.supplier ?? b.name ?? b.salesman ?? b.item ?? b.job ?? "")));
  return filtered;
}

export function purchaseRemainingLine(line: { quantity: number; subtotal: number; exchangeRate: number }, received: number) {
  const quantity = Math.max(0, Math.round((line.quantity - received) * 1e6) / 1e6);
  const unitCost = line.quantity ? line.subtotal * line.exchangeRate / line.quantity : 0;
  return { orderedQuantity: line.quantity, receivedQuantity: Math.min(line.quantity, Math.max(0, received)), quantity, unitCost, amount: quantity * unitCost };
}

// Resolve actual journal credit accounts for posted purchases. POs retain their saved,
// planned account. Never silently substitute today's default account for history.
export function purchaseDocumentAccount(transaction: { id: number; type: string; account: string; currency: string }, journal: Array<{ transactionId: number | null; account: string; accountId?: number | null; credit: number; debit?: number }>, accounts: Array<{ id: number; code: string; name: string; currency: string; systemRole?: string | null }>) {
  // The payable / payment side: credits on bills and expenses, but the debit on a purchase return (vendor credit),
  // which debits Accounts Payable and credits the stock or purchase account.
  const posted = journal.filter((entry) => entry.transactionId === transaction.id && (transaction.type === "vendor credit" ? Number(entry.debit ?? 0) : entry.credit) > 0);
  // Saved journal account IDs are authoritative when every non-VAT credit posts to the same account.
  const savedIds = [...new Set(posted.map((entry) => accounts.find((account) => account.id === entry.accountId)).filter((account): account is NonNullable<typeof account> => Boolean(account) && !/VAT/.test(account!.systemRole ?? "") && !/VAT/i.test(account!.name)).map((account) => account.id))];
  if (transaction.type !== "purchase order" && savedIds.length === 1 && posted.every((entry) => entry.accountId)) {
    const saved = accounts.find((account) => account.id === savedIds[0])!;
    return { account: `${saved.code} · ${saved.name}`, accountAccountId: saved.id };
  }
  const credits = [...new Set(posted.filter((entry) => !accounts.some((account) => account.name === entry.account && /VAT/.test(account.systemRole ?? "")) && !/VAT/i.test(entry.account)).map((entry) => entry.account))];
  const name = transaction.type === "purchase order" ? transaction.account : credits.length === 1 ? credits[0] : "";
  if (!name) return { account: credits.length > 1 ? "Multiple posted credit accounts · open document" : "No posted payable / payment account", accountAccountId: 0 };
  const candidates = accounts.filter((account) => account.name === name);
  const currencyMatches = candidates.filter((account) => account.currency.toUpperCase() === transaction.currency.toUpperCase());
  const account = candidates.length === 1 ? candidates[0] : currencyMatches.length === 1 ? currencyMatches[0] : undefined;
  return { account: account ? `${account.code} · ${account.name}` : `${name} · account link needs review`, accountAccountId: account?.id ?? 0 };
}

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
    "purchases-by-rep-summary": "purchases-by-rep-detail",
  } as Record<string, string>)[key] || "";
}

export function purchaseSummary(report: PurchaseReportLike): { cards: PurchaseSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!purchaseReportKeys.has(key)) return null;

  if (key === "purchases-by-vendor") {
    const total = sum(rows, "amount");
    return { cards: [money("Net purchases before VAT", total, "accent"), money("Purchases", sum(rows, "purchases")), money("Returns", sum(rows, "returns"), "negative"), number("Suppliers", rows.length), money("Largest supplier spend", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))))], note: "Bills, received-item bills, expenses, cheques and card charges before VAT, less purchase returns, in home currency at each document's exchange rate. Cancelled, void and draft documents are excluded." };
  }
  if (key === "purchases-by-supplier-detail") {
    return { cards: [money("Purchases before VAT", sum(rows, "subtotal"), "accent"), money("Document VAT", sum(rows, "vat")), money("Gross total", sum(rows, "total")), number("Documents", rows.length), number("Suppliers", unique(rows, "supplier"))], note: "Amounts are in home currency; Document currency identifies the original bill or expense. Accounts come from posted journal credits, and open their Chart of Accounts history. Purchase returns are shown separately in supplier account reports." };
  }
  if (key === "purchases-by-item" || key === "purchases-by-item-detail") {
    const quantity = sum(rows, "quantity");
    const landed = key === "purchases-by-item" ? sum(rows, "landed") : sum(rows, "subtotal") + sum(rows, "freight");
    return { cards: [money("Landed cost before VAT", landed, "accent"), money("Freight", sum(rows, "freight")), number("Net quantity", quantity), number(key === "purchases-by-item" ? "Items" : "Purchase lines", rows.length), money("Average landed unit cost", quantity ? landed / quantity : 0)], note: "Bill and received-item-bill lines less purchase returns, in home currency. Freight is added to each item's landed cost instead of being listed as an item. Cancelled, void and draft documents are excluded." };
  }
  if (key === "purchases-by-rep-summary") {
    const total = sum(rows, "subtotal");
    const assigned = rows.filter((row) => row.salesman !== "Unassigned");
    return { cards: [money("Purchases before VAT", total, "accent"), number("Sales reps", assigned.length), number("Documents", sum(rows, "documents")), money("Unassigned purchases", sum(rows.filter((row) => row.salesman === "Unassigned"), "subtotal"), "negative")], note: "Bills, received-item bills, purchase expenses and vendor credits (negative) before VAT, in home currency, grouped by the Sales Rep saved on each document. Cancelled and void documents are excluded. Select a total to open the detail report." };
  }
  if (key === "purchases-by-rep-detail") {
    return { cards: [money("Purchases before VAT", sum(rows, "subtotal"), "accent"), money("Document VAT", sum(rows, "vat")), money("Gross total", sum(rows, "total")), number("Documents", rows.length), number("Sales reps", unique(rows.filter((row) => row.salesman !== "Unassigned"), "salesman"))], note: "Amounts are in home currency; vendor credits are negative. Document numbers open the purchase document and accounts open their Chart of Accounts history from the posted journal credit." };
  }
  if (key === "purchase-order-summary") {
    return { cards: [number("Total orders", sum(rows, "totalOrders")), number("Open", sum(rows, "open"), "accent"), number("Partially received", sum(rows, "partiallyReceived"), "negative"), number("Fully received", sum(rows, "received"), "positive"), number("Suppliers", rows.filter((row) => Number(row.totalOrders) > 0).length)], note: "Order counts include open, partially received, completed and closed/cancelled purchase orders. Select a total to open that supplier's purchase-order area. Purchase orders do not post to the ledger." };
  }
  if (key === "open-purchase-orders") {
    return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Open orders", rows.length), number("Suppliers", unique(rows, "supplier")), number("Partially received", rows.filter((row) => String(row.status) === "partially received").length, "negative")], note: "Remaining commitments before VAT, in home currency, after all saved receiving allocations. Purchase orders are not posted to the ledger; account links show their saved planned account. Select a PO to open receiving." };
  }
  if (key === "open-purchase-orders-detail") {
    return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Open quantity", sum(rows, "quantity")), number("Purchase lines", rows.length), number("Suppliers", unique(rows, "supplier"))], note: "Remaining quantities and commitments before VAT, in home currency, after all saved receiving allocations. PO accounts are planned, not posted. Each PO number opens its receiving workflow." };
  }

  return { cards: [money("Open commitment", sum(rows, "amount"), "accent"), number("Jobs / inventories", rows.length), number("Open orders", sum(rows, "orders")), number("Supplier groups", sum(rows, "suppliers"))], note: "Remaining commitments before VAT, in home currency, grouped by inventory/job after saved receiving allocations. A supplier may appear in multiple groups. Purchase orders are not ledger postings; open the detail report for source orders and planned accounts." };
}
