import { and, asc, eq, sum } from "drizzle-orm";
import { getDb } from "../../../db";
import { contacts, items, journalEntries, journalLines, transactionLines, transactions } from "../../../db/schema";

type Row = Record<string, string | number>;
const money = { type: "money" as const };
const amountColumns = (first = "Account") => [
  { key: "name", label: first }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Balance", ...money },
];

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("type") ?? "profit-loss";
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    const currency = String(url.searchParams.get("currency") ?? "AED");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const [allTransactions, allContacts, allItems, ledger, journal, lines] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.companyId, companyId)).orderBy(asc(transactions.transactionDate)),
      db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)),
      db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name)),
      db.select({ name: journalLines.accountName, debit: sum(journalLines.debit), credit: sum(journalLines.credit) }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.companyId, companyId)).groupBy(journalLines.accountName).orderBy(asc(journalLines.accountName)),
      db.select({ date: journalEntries.entryDate, reference: journalEntries.reference, description: journalEntries.description, account: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.companyId, companyId)).orderBy(asc(journalEntries.entryDate), asc(journalLines.id)),
      db.select({ itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, unitCost: transactionLines.unitCost, type: transactions.type, party: transactions.party, exchangeRate: transactions.exchangeRate }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId))),
    ]);
    const ledgerRows = ledger.map((row) => ({ name: row.name, debit: Number(row.debit ?? 0), credit: Number(row.credit ?? 0), balance: Number(row.debit ?? 0) - Number(row.credit ?? 0) }));
    const incomeNames = ["Sales Revenue", "Other Income"];
    const expenseNames = ["Purchases", "Operating Expenses", "Cost of Goods Sold"];
    const assetNames = ["Business Bank", "Accounts Receivable", "Inventory Asset", "Recoverable VAT"];
    const liabilityNames = ["Accounts Payable", "VAT Payable"];
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
    let title = "Transaction List by Date";
    let columns: Array<{ key: string; label: string; type?: "money" }> = txColumns;
    let rows: Row[] = txRows();

    if (key === "profit-loss") {
      title = "Profit & Loss Standard";
      rows = ledgerRows.filter((row) => incomeNames.includes(row.name) || expenseNames.some((name) => row.name.includes(name)) || row.name.includes("Expense")).map((row) => ({ name: row.name, amount: incomeNames.includes(row.name) ? -row.balance : row.balance }));
      const income = rows.filter((row) => incomeNames.includes(String(row.name))).reduce((n, row) => n + Number(row.amount), 0);
      const expenses = rows.filter((row) => !incomeNames.includes(String(row.name))).reduce((n, row) => n + Number(row.amount), 0);
      rows.push({ name: "Net income", amount: income - expenses });
      columns = [{ key: "name", label: "Account" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "balance-sheet") {
      title = "Balance Sheet Standard";
      rows = ledgerRows.filter((row) => assetNames.includes(row.name) || liabilityNames.includes(row.name) || row.name.includes("Equity")).map((row) => ({ name: row.name, section: assetNames.includes(row.name) ? "Assets" : liabilityNames.includes(row.name) ? "Liabilities" : "Equity", amount: assetNames.includes(row.name) ? row.balance : -row.balance }));
      columns = [{ key: "section", label: "Section" }, { key: "name", label: "Account" }, { key: "amount", label: "Balance", ...money }];
    } else if (key === "trial-balance") {
      title = "Trial Balance"; rows = ledgerRows; columns = amountColumns();
    } else if (key === "general-ledger" || key === "journal") {
      title = key === "journal" ? "Journal" : "General Ledger";
      rows = journal; columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "account", label: "Account" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }];
    } else if (key === "cash-flow") {
      title = "Statement of Cash Flows";
      rows = ledgerRows.filter((row) => row.name === "Business Bank").map((row) => ({ name: "Net cash from operating activities", amount: row.balance }));
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

    return Response.json({ report: { key, title, generatedAt: new Date().toISOString(), currency, columns, rows } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not generate report." }, { status: 500 });
  }
}
