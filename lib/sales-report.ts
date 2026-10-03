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

export type SalesReportRow = Record<string, string | number | null>;
export type SalesReportColumn = { key: string; label: string; type?: "money" };
export const salesReportGroups = [
  { title: "Daily activity", description: "Compare daily totals and inspect original invoices and receipts.", keys: ["daily-sales-summary", "daily-sales-detail"] },
  { title: "Customer & delivery", description: "Understand customer spending and delivery destinations.", keys: ["sales-by-customer", "sales-by-customer-detail", "sales-by-ship-to"] },
  { title: "Product sales", description: "Review sold quantities, unit prices and product revenue.", keys: ["sales-by-item", "sales-by-item-detail"] },
  { title: "Performance & trends", description: "Track sales representatives, monthly sales and credit memo returns.", keys: ["sales-by-rep-summary", "sales-by-rep-detail", "sales-graph"] },
  { title: "Pipeline & fulfilment", description: "Follow open sales documents and the delivery progress of orders.", keys: ["pending-sales", "sales-orders"] },
];
export const emptySalesFilters = { query: "", customer: "", salesman: "", account: "", revenueAccount: "", status: "", sort: "default" };
export function uniqueSalesReports<T extends { key: string }>(reports: T[]) {
  return [...new Map(reports.map((report) => [report.key, report])).values()];
}
export function salesColumnKind(column: SalesReportColumn): "text" | "quantity" | "price" | "amount" {
  if (column.type === "money") return /price|cost/i.test(column.key) ? "price" : "amount";
  return ["quantity", "fulfilledQuantity", "remainingQuantity", "documents", "customers"].includes(column.key) ? "quantity" : "text";
}
export function salesColumnWeight(column: SalesReportColumn) {
  if (column.key === "item") return 5;
  if (["name", "customer", "party", "address"].includes(column.key)) return 3.5;
  if (/account/i.test(column.key) || column.key === "sourceReference") return 3;
  if (/date/i.test(column.key)) return 2.2;
  return column.type === "money" ? 2.2 : 1.8;
}
export function salesColumnTotal(rows: SalesReportRow[], column: SalesReportColumn) {
  if (!["quantity", "fulfilledQuantity", "remainingQuantity", "documents", "amount", "sales", "vat", "total", "refunds", "netSales"].includes(column.key)) return null;
  return rows.reduce((total, row) => total + Number(row[column.key] ?? 0), 0);
}
export function salesCustomer(row: SalesReportRow, key = "") {
  return String(row.customer ?? row.party ?? (key === "sales-by-customer" ? row.name : "") ?? "");
}
export function filterSalesReportRows<T extends SalesReportRow>(rows: T[], columns: SalesReportColumn[], filters: typeof emptySalesFilters, key = "") {
  const query = filters.query.trim().toLocaleLowerCase("en-AE");
  const result = rows.filter((row) => (!query || columns.some((column) => String(row[column.key] ?? "").toLocaleLowerCase("en-AE").includes(query))) && (!filters.customer || salesCustomer(row, key) === filters.customer) && (["salesman", "account", "revenueAccount", "status"] as const).every((field) => !filters[field] || row[field] === filters[field]));
  if (filters.sort === "amount") result.sort((a, b) => Number(b.amount ?? b.sales ?? b.total ?? 0) - Number(a.amount ?? a.sales ?? a.total ?? 0));
  if (filters.sort === "quantity") result.sort((a, b) => Number(b.quantity ?? 0) - Number(a.quantity ?? 0));
  if (filters.sort === "date") result.sort((a, b) => String(b.date ?? b.month ?? "").localeCompare(String(a.date ?? a.month ?? "")));
  if (filters.sort === "name") result.sort((a, b) => String(a.customer ?? a.party ?? a.name ?? a.salesman ?? a.item ?? "").localeCompare(String(b.customer ?? b.party ?? b.name ?? b.salesman ?? b.item ?? "")));
  return result;
}

export function salesFulfilment(quantity: number, allocated: number) {
  const fulfilledQuantity = Math.min(Math.max(0, quantity), Math.max(0, allocated));
  return { quantity, fulfilledQuantity, remainingQuantity: Math.max(0, Math.round((quantity - fulfilledQuantity) * 1e6) / 1e6) };
}

type SalesAccount = { id: number; code: string; name: string; currency: string; type?: string; systemRole?: string | null };
export function salesDocumentAccounts(transaction: { id: number; type: string; account: string; currency: string }, journal: Array<{ transactionId: number | null; account: string; debit: number; credit: number }>, accounts: SalesAccount[]) {
  const linked = (names: string[], field: "account" | "revenueAccount") => {
    const uniqueNames = [...new Set(names)];
    if (uniqueNames.length !== 1) return { [field]: uniqueNames.length ? "Multiple posted accounts · open source" : field === "account" ? "No posted receivable / receipt account" : "No posted revenue account", [`${field}AccountId`]: 0, [`${field}TransactionId`]: uniqueNames.length ? transaction.id : 0 };
    const name = uniqueNames[0], candidates = accounts.filter((account) => account.name === name);
    const currencyMatches = candidates.filter((account) => account.currency.toUpperCase() === transaction.currency.toUpperCase());
    const account = candidates.length === 1 ? candidates[0] : currencyMatches.length === 1 ? currencyMatches[0] : undefined;
    return { [field]: account ? `${account.code} · ${account.name}` : `${name} · account link needs review`, [`${field}AccountId`]: account?.id ?? 0 };
  };
  if (!["invoice", "sales receipt"].includes(transaction.type)) return { ...linked(transaction.account ? [transaction.account] : [], "account"), revenueAccount: "Not posted", revenueAccountAccountId: 0 };
  const entries = journal.filter((entry) => entry.transactionId === transaction.id);
  const hasRoleOrType = (name: string, roles: string[], types: string[]) => accounts.some((account) => account.name === name && (roles.includes(account.systemRole ?? "") || types.includes(account.type ?? "")));
  const debits = entries.filter((entry) => entry.debit > 0 && !hasRoleOrType(entry.account, ["INVENTORY", "INPUT_VAT", "OUTPUT_VAT", "COGS", "PURCHASES"], ["Cost of Goods Sold", "Expense", "Other Expense"]));
  const controls = debits.filter((entry) => entry.account === transaction.account || hasRoleOrType(entry.account, ["AR", "BANK", "CASH"], ["Accounts Receivable", "Bank"]));
  const revenue = entries.filter((entry) => entry.credit > 0 && !hasRoleOrType(entry.account, ["INVENTORY", "INPUT_VAT", "OUTPUT_VAT"], ["Other Current Asset", "Accounts Receivable", "Bank"]) && (hasRoleOrType(entry.account, ["SALES", "OTHER_INCOME"], ["Income", "Other Income"]) || !/VAT/i.test(entry.account)));
  return { ...linked((controls.length ? controls : debits).map((entry) => entry.account), "account"), ...linked(revenue.map((entry) => entry.account), "revenueAccount") };
}

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
    return { cards: [moneyCard("Sales before VAT", sum(rows, "sales"), "positive"), moneyCard("VAT", sum(rows, "vat")), moneyCard("Gross total", sum(rows, "total"), "accent"), numberCard("Documents", sum(rows, "documents")), numberCard("Quantity sold", sum(rows, "quantity"))], note: "Daily totals use unique invoices and sales receipts, before VAT, in home currency. Freight-only lines are excluded from quantity counts. Credit memo returns are shown separately in Sales Graph." };
  }
  if (key === "sales-by-customer-detail") {
    return { cards: [moneyCard("Sales before VAT", sum(rows, "amount"), "positive"), moneyCard("VAT", sum(rows, "vat")), moneyCard("Gross total", sum(rows, "total"), "accent"), numberCard("Documents", rows.length), numberCard("Customers", unique(rows, "customer"))], note: "Sales exclude VAT and credit memo returns. Original document links open sales; receivable/receipt and revenue accounts open posted Chart of Accounts history. Customer names open their account area." };
  }
  if (key === "sales-by-customer") {
    const total = sum(rows, "amount");
    return { cards: [moneyCard("Sales before VAT", total, "positive"), numberCard("Customers", rows.length), moneyCard("Average per customer", rows.length ? total / rows.length : 0), moneyCard("Top customer sales", Math.max(0, ...rows.map((row) => Number(row.amount ?? 0))), "accent")], note: "Customer totals show invoices and sales receipts before VAT, in home currency. Credit memo returns are shown separately in Sales Graph. Select a customer to open its account area." };
  }
  if (key === "sales-by-item" || key === "sales-by-item-detail") {
    const quantity = sum(rows, "quantity");
    const sales = sum(rows, "amount");
    return { cards: [moneyCard("Sales before VAT", sales, "positive"), numberCard("Quantity sold", quantity), numberCard(key === "sales-by-item" ? "Items" : "Sales lines", rows.length), moneyCard("Average unit value", quantity ? sales / quantity : 0)], note: "Sales exclude VAT and credit memo returns. Unit prices are per-line averages before VAT; they are not added in totals. Source numbers open original sales documents, and detail account links open posted receivable/receipt and revenue accounts." };
  }
  if (key === "sales-by-rep-summary" || key === "sales-by-rep-detail") {
    const sales = sum(rows, "amount");
    const documents = key === "sales-by-rep-summary" ? sum(rows, "documents") : rows.length;
    return { cards: [moneyCard("Sales before VAT", sales, "positive"), numberCard("Sales reps", unique(rows, "salesman")), numberCard("Documents", documents), moneyCard("Average per document", documents ? sales / documents : 0)], note: "Sales performance is grouped by the sales representative saved on each posted sales document." };
  }
  if (key === "sales-by-ship-to") {
    const sales = sum(rows, "amount");
    return { cards: [moneyCard("Sales before VAT", sales, "positive"), numberCard("Destinations", rows.length), numberCard("Customer groups", sum(rows, "customers")), numberCard("Documents", sum(rows, "documents"))], note: "Destinations use the current country/address of the customer record, rather than the historical shipping address. A customer may appear in multiple groups; sales exclude VAT and credit memo returns." };
  }
  if (key === "sales-graph") {
    const sales = sum(rows, "sales");
    const refunds = sum(rows, "refunds");
    return { cards: [moneyCard("Sales before VAT", sales, "positive"), moneyCard("Refunds", refunds, refunds > 0 ? "negative" : "neutral"), moneyCard("Net sales after returns", sales - refunds, "accent"), numberCard("Months", rows.length)], note: "The chart compares sales and credit memo returns before VAT, in home currency. The net figure deducts credit memos." };
  }
  if (key === "pending-sales") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const overdue = rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.dueDate || "")) && String(row.dueDate) < today).length;
    return { cards: [moneyCard("Document face value", sum(rows, "amount"), "accent"), numberCard("Open documents", rows.length), numberCard("Customers", unique(rows, "customer")), { label: "Past due", value: overdue, format: "number", tone: overdue ? "negative" : "positive" }], note: "Face values include VAT and combine unposted pipeline documents with unpaid invoice original amounts. This is not an open receivables balance or a revenue forecast. Invoice payments are reflected in Customer Open Balance. Account links show saved planned accounts for unposted documents and actual posted accounts for invoices." };
  }
  if (key === "sales-orders") {
    return { cards: [moneyCard("Order value", sum(rows, "amount"), "accent"), numberCard("Sales orders", rows.length), numberCard("Customers", unique(rows, "party")), numberCard("Statuses", unique(rows, "status"))], note: "Order face values include VAT; orders are unposted commitments. Ordered, invoiced and remaining quantities use all current saved fulfilment allocations, including invoices after the selected order date range. Select an order to open fulfilment." };
  }

  const sales = sum(rows, "amount");
  return { cards: [moneyCard("Sales before VAT", sales, "positive"), numberCard("Documents", rows.length), numberCard("Customers", unique(rows, "customer")), numberCard("Sales reps", unique(rows, "salesman"))], note: "Sales exclude VAT and credit memo returns. Document numbers open original sales; account links open actual posted receivable/receipt and revenue history. Credit memo returns are shown in Sales Graph." };
}
