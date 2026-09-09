import { and, asc, eq, sum } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, contacts, items, journalEntries, journalLines, transactionLines, transactions, vatCodes } from "../../../db/schema";
import { requireApiUser } from "@/lib/auth";

type Row = Record<string, string | number>;
const money = { type: "money" as const };
const amountColumns = (first = "Account") => [
  { key: "name", label: first }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Balance", ...money },
];

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "reports:read");
  if (authorization instanceof Response) return authorization;
  try {
    const key = new URL(request.url).searchParams.get("type") ?? "profit-loss";
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    const currency = String(url.searchParams.get("currency") ?? "AED");
    const periodStart = String(url.searchParams.get("periodStart") ?? "");
    const periodEnd = String(url.searchParams.get("periodEnd") ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const journalFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
    const [allTransactions, allContacts, allItems, allAccounts, ledger, journal, lines, configuredVatCodes] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.companyId, companyId)).orderBy(asc(transactions.transactionDate)),
      db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)),
      db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name)),
      db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code)),
      db.select({ name: journalLines.accountName, debit: sum(journalLines.debit), credit: sum(journalLines.credit) }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).groupBy(journalLines.accountName).orderBy(asc(journalLines.accountName)),
      db.select({ date: journalEntries.entryDate, reference: journalEntries.reference, description: journalEntries.description, account: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).orderBy(asc(journalEntries.entryDate), asc(journalLines.id)),
      db.select({ itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, unitCost: transactionLines.unitCost, vatCode: transactionLines.vatCode, vatRate: transactionLines.vatRate, vatAmount: transactionLines.vatAmount, type: transactions.type, party: transactions.party, date: transactions.transactionDate, number: transactions.number, transactionCurrency: transactions.currency, exchangeRate: transactions.exchangeRate, isImport: transactions.isImport }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId))),
      db.select().from(vatCodes).where(eq(vatCodes.companyId, companyId)).orderBy(asc(vatCodes.code)),
    ]);
    const accountTypes = new Map(allAccounts.map((account) => [account.name, account.type]));
    const ledgerRows = ledger.map((row) => ({ name: row.name, type: accountTypes.get(row.name) ?? "Unclassified", debit: Number(row.debit ?? 0), credit: Number(row.credit ?? 0), balance: Number(row.debit ?? 0) - Number(row.credit ?? 0) }));
    const incomeTypes = new Set(["Income", "Other Income"]);
    const expenseTypes = new Set(["Expense", "Cost of Goods Sold", "Other Expense"]);
    const assetTypes = new Set(["Bank", "Accounts Receivable", "Other Current Asset", "Fixed Asset", "Other Asset"]);
    const liabilityTypes = new Set(["Accounts Payable", "Other Current Liability", "Long Term Liability", "Loan", "Credit Card"]);
    const txRows = (types?: string[]) => allTransactions.filter((row) => !types || types.includes(row.type)).map((row) => ({ date: row.transactionDate, number: row.number, type: row.type, party: row.party, status: row.status, currency: row.currency, amount: row.baseTotal }));
    const txColumns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "party", label: "Name" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", ...money }];
    const groupTransactions = (types: string[]) => {
      const grouped = new Map<string, number>();
      allTransactions.filter((row) => types.includes(row.type)).forEach((row) => grouped.set(row.party, (grouped.get(row.party) ?? 0) + row.baseTotal));
      return [...grouped].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    };
    const groupLines = (types: string[]) => {
      const grouped = new Map<string, { quantity: number; amount: number; cost: number }>();
      lines.filter((line) => types.includes(line.type)).forEach((line) => {
        const old = grouped.get(line.description) ?? { quantity: 0, amount: 0, cost: 0 };
        grouped.set(line.description, { quantity: old.quantity + line.quantity, amount: old.amount + line.subtotal * line.exchangeRate, cost: old.cost + line.quantity * line.unitCost * line.exchangeRate });
      });
      return [...grouped].map(([name, value]) => ({ name, ...value, profit: value.amount - value.cost }));
    };
    const aged = (type: "invoice" | "bill") => allTransactions.filter((row) => row.type === type && !["paid", "cleared"].includes(row.status)).map((row) => {
      const age = row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0;
      return { name: row.party, current: age <= 0 ? row.baseTotal : 0, days30: age > 0 && age <= 30 ? row.baseTotal : 0, days60: age > 30 && age <= 60 ? row.baseTotal : 0, days90: age > 60 ? row.baseTotal : 0, total: row.baseTotal };
    });
    const agingColumns = [{ key: "name", label: "Name" }, { key: "current", label: "Current", ...money }, { key: "days30", label: "1–30", ...money }, { key: "days60", label: "31–60", ...money }, { key: "days90", label: "61+", ...money }, { key: "total", label: "Total", ...money }];
    const vatDocumentTypes = new Set(["invoice", "sales receipt", "credit memo", "bill", "expense", "vendor credit"]);
    const vatLines = lines.filter((line) => vatDocumentTypes.has(line.type) && (!periodStart || line.date >= periodStart) && (!periodEnd || line.date <= periodEnd));
    const outputVat = vatLines.reduce((sum, line) => sum + (line.type === "credit memo" ? -1 : ["invoice", "sales receipt"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    const inputVat = vatLines.reduce((sum, line) => sum + (line.type === "vendor credit" ? -1 : ["bill", "expense"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    let title = "Transaction List by Date";
    let columns: Array<{ key: string; label: string; type?: "money" }> = txColumns;
    let rows: Row[] = txRows();

    if (key === "profit-loss") {
      title = "Profit & Loss Standard";
      rows = ledgerRows.filter((row) => incomeTypes.has(row.type) || expenseTypes.has(row.type)).map((row) => ({ name: row.name, type: row.type, amount: incomeTypes.has(row.type) ? -row.balance : row.balance }));
      const income = rows.filter((row) => incomeTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      const expenses = rows.filter((row) => expenseTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      rows.push({ name: "Net income", amount: income - expenses });
      columns = [{ key: "name", label: "Account" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "balance-sheet") {
      title = "Balance Sheet Standard";
      rows = ledgerRows.filter((row) => assetTypes.has(row.type) || liabilityTypes.has(row.type) || row.type === "Equity").map((row) => ({ name: row.name, section: assetTypes.has(row.type) ? "Assets" : liabilityTypes.has(row.type) ? "Liabilities" : "Equity", amount: assetTypes.has(row.type) ? row.balance : -row.balance }));
      columns = [{ key: "section", label: "Section" }, { key: "name", label: "Account" }, { key: "amount", label: "Balance", ...money }];
    } else if (key === "trial-balance") {
      title = "Trial Balance"; rows = ledgerRows; columns = amountColumns();
    } else if (key === "general-ledger" || key === "journal") {
      title = key === "journal" ? "Journal" : "General Ledger";
      rows = journal; columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "account", label: "Account" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }];
    } else if (key === "cash-flow") {
      title = "Statement of Cash Flows";
      const bankAccounts = new Set(allAccounts.filter((account) => account.systemRole === "BANK" || account.type === "Bank").map((account) => account.name));
      rows = ledgerRows.filter((row) => bankAccounts.has(row.name)).map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Activity" }, { key: "amount", label: "Amount", ...money }];
    } else if (key.startsWith("ar-aging")) {
      title = key.endsWith("detail") ? "A/R Aging Detail" : "A/R Aging Summary"; rows = aged("invoice"); columns = agingColumns;
    } else if (key.startsWith("ap-aging")) {
      title = key.endsWith("detail") ? "A/P Aging Detail" : "A/P Aging Summary"; rows = aged("bill"); columns = agingColumns;
    } else if (key === "sales-by-customer" || key === "customer-balances") {
      title = key === "sales-by-customer" ? "Sales by Customer" : "Customer Balance Summary";
      rows = key === "sales-by-customer" ? groupTransactions(["invoice", "sales receipt"]) : allContacts.filter((row) => row.type === "customer").map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Customer" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "purchases-by-vendor" || key === "vendor-balances") {
      title = key === "purchases-by-vendor" ? "Purchases by Vendor" : "Vendor Balance Summary";
      rows = key === "purchases-by-vendor" ? groupTransactions(["bill", "expense"]) : allContacts.filter((row) => row.type === "vendor").map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Vendor" }, { key: "amount", label: "Amount", ...money }];
    } else if (["sales-by-item", "purchases-by-item", "item-profitability"].includes(key)) {
      title = key === "sales-by-item" ? "Sales by Item" : key === "purchases-by-item" ? "Purchases by Item" : "Item Profitability";
      rows = groupLines(key === "purchases-by-item" ? ["bill"] : ["invoice", "sales receipt"]);
      columns = [{ key: "name", label: "Item" }, { key: "quantity", label: "Quantity" }, { key: "amount", label: "Sales / Purchases", ...money }, ...(key === "item-profitability" ? [{ key: "profit", label: "Gross Profit", ...money }] : [])];
    } else if (key === "inventory-valuation" || key === "inventory-status" || key === "physical-inventory") {
      title = key === "inventory-valuation" ? "Inventory Valuation" : key === "inventory-status" ? "Inventory Stock Status" : "Physical Inventory Worksheet";
      rows = allItems.map((row) => ({ sku: row.sku, name: row.name, quantity: row.quantity, reorder: row.reorderPoint, cost: row.cost, value: row.quantity * row.cost, count: "" }));
      columns = [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "quantity", label: "On Hand" }, { key: "reorder", label: "Reorder" }, { key: "cost", label: "Avg. Cost", ...money }, { key: "value", label: "Value", ...money }];
    } else if (key === "open-invoices") { title = "Open Invoices"; rows = txRows(["invoice"]).filter((row) => !["paid", "cleared"].includes(String(row.status))); }
    else if (key === "sales-orders") { title = "Sales Order Fulfilment"; rows = txRows(["sales order"]); }
    else if (key === "open-purchase-orders") { title = "Open Purchase Orders"; rows = txRows(["purchase order"]); }
    else if (key === "vat-summary") {
      title = "VAT Summary Report";
      rows = [{ name: "Output VAT on sales", amount: outputVat }, { name: "Recoverable input VAT", amount: inputVat }, { name: "Net VAT due", amount: outputVat - inputVat }];
      columns = [{ key: "name", label: "VAT position" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "vat-detail") {
      title = "VAT Detail Report";
      rows = vatLines.map((line) => ({ date: line.date, number: line.number, type: line.type, party: line.party, code: line.vatCode, rate: `${line.vatRate}%`, taxable: line.subtotal * line.exchangeRate, vat: line.vatAmount * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "party", label: "Name" }, { key: "code", label: "VAT Code" }, { key: "rate", label: "Rate" }, { key: "taxable", label: "Taxable Amount", ...money }, { key: "vat", label: "VAT", ...money }];
    } else if (key === "vat-unassigned") {
      title = "Unassigned VAT Amounts Detail Report";
      const knownCodes = new Set(configuredVatCodes.map((code) => code.code));
      rows = vatLines.filter((line) => !line.vatCode || !knownCodes.has(line.vatCode)).map((line) => ({ date: line.date, number: line.number, type: line.type, party: line.party, description: line.description, taxable: line.subtotal * line.exchangeRate, vat: line.vatAmount * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "party", label: "Name" }, { key: "description", label: "Item / description" }, { key: "taxable", label: "Taxable Amount", ...money }, { key: "vat", label: "VAT", ...money }];
    } else if (key === "vat-exceptions") {
      title = "VAT Exception Report";
      rows = vatLines.filter((line) => Math.abs(line.vatAmount - line.subtotal * line.vatRate / 100) > 0.01).map((line) => ({ date: line.date, number: line.number, description: line.description, code: line.vatCode, expected: line.subtotal * line.vatRate / 100 * line.exchangeRate, posted: line.vatAmount * line.exchangeRate, difference: (line.vatAmount - line.subtotal * line.vatRate / 100) * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "description", label: "Item / description" }, { key: "code", label: "VAT Code" }, { key: "expected", label: "Expected VAT", ...money }, { key: "posted", label: "Posted VAT", ...money }, { key: "difference", label: "Difference", ...money }];
    } else if (key === "vat-item-summary") {
      title = "VAT Item Summary";
      const grouped = new Map<string, { taxable: number; vat: number }>();
      vatLines.forEach((line) => { const old = grouped.get(line.description) ?? { taxable: 0, vat: 0 }; grouped.set(line.description, { taxable: old.taxable + line.subtotal * line.exchangeRate, vat: old.vat + line.vatAmount * line.exchangeRate }); });
      rows = [...grouped].map(([name, totals]) => ({ name, ...totals })).sort((a, b) => b.vat - a.vat);
      columns = [{ key: "name", label: "Item / description" }, { key: "taxable", label: "Taxable Amount", ...money }, { key: "vat", label: "VAT", ...money }];
    } else if (key === "ec-sales") {
      title = "EC Sales List";
      rows = vatLines.filter((line) => ["invoice", "sales receipt"].includes(line.type) && line.vatRate === 0 && line.transactionCurrency !== currency).map((line) => ({ date: line.date, number: line.number, customer: line.party, currency: line.transactionCurrency, description: line.description, amount: line.subtotal * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "customer", label: "Customer" }, { key: "currency", label: "Currency" }, { key: "description", label: "Item / description" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "reverse-charge") {
      title = "Reverse Charge List";
      rows = vatLines.filter((line) => line.type === "bill" && line.isImport).map((line) => ({ date: line.date, number: line.number, vendor: line.party, currency: line.transactionCurrency, description: line.description, taxable: line.subtotal * line.exchangeRate, vat: line.vatAmount * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "vendor", label: "Vendor" }, { key: "currency", label: "Currency" }, { key: "description", label: "Item / description" }, { key: "taxable", label: "Taxable Amount", ...money }, { key: "vat", label: "VAT", ...money }];
    } else if (key === "vat-code-list") {
      title = "VAT Code List";
      rows = configuredVatCodes.map((code) => ({ code: code.code, name: code.name, rate: `${code.rate}%`, description: code.description, status: code.active ? "Active" : "Inactive" }));
      columns = [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "rate", label: "Rate" }, { key: "description", label: "Details" }, { key: "status", label: "Status" }];
    }

    return Response.json({ report: { key, title, generatedAt: new Date().toISOString(), currency, columns, rows } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not generate report." }, { status: 500 });
  }
}
