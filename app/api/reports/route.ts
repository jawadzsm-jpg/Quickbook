import { and, asc, eq, inArray, sum } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, auditLog, companies, contacts, exchangeRates, inventoryLocations, items, journalEntries, journalLines, transactionLines, transactions, vatCodes } from "../../../db/schema";
import { stockPricingRows } from "@/lib/stock-pricing";
import { canAccessCompany, hasPermission, isAdministrator, requireApiUser } from "@/lib/auth";

type Row = Record<string, string | number>;
const money = { type: "money" as const };
const amountColumns = (first = "Account") => [
  { key: "name", label: first }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Balance", ...money },
];

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("type") ?? "profit-loss";
  const authorization = await requireApiUser(request);
  if (authorization instanceof Response) return authorization;
  const canOpen = key === "customer-statements" ? hasPermission(authorization, "sales:write") || hasPermission(authorization, "reports:read") : hasPermission(authorization, "reports:read");
  if (!canOpen) return Response.json({ error: "Your role does not allow this report." }, { status: 403 });
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));

    const periodStart = String(url.searchParams.get("periodStart") ?? "");
    const periodEnd = String(url.searchParams.get("periodEnd") ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const [reportCompany] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!reportCompany) return Response.json({ error: "Company not found." }, { status: 404 });
    // Report amounts are stored/converted in home currency; never relabel them from a query parameter.
    const currency = reportCompany.baseCurrency;
    const scoped = Number.isInteger(locationId) && locationId > 0;
    if (scoped) {
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).limit(1);
      if (!location) return Response.json({ error: "Select an inventory in this company." }, { status: 400 });
    }
    if (key === "stock-pricing-profit") {
      const scoped = Number.isInteger(locationId) && locationId > 0;
      const [company, stock, purchaseLines, inventories] = await Promise.all([
        db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1),
        db.select().from(items).where(scoped ? and(eq(items.companyId, companyId), scoped ? eq(items.locationId, locationId) : undefined) : eq(items.companyId, companyId)).orderBy(asc(items.name), asc(items.id)),
        db.select({ transactionId: transactions.id, itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, type: transactions.type, date: transactions.transactionDate, number: transactions.number, exchangeRate: transactions.exchangeRate }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactions.companyId, companyId), scoped ? eq(transactions.locationId, locationId) : undefined, inArray(transactions.type, ["bill", "received item bill", "item receipt"]))),
        db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)),
      ]);
      if (!company[0]) return Response.json({ error: "Company not found." }, { status: 404 });
      return Response.json({ report: { key, companyId, canEditPrices: isAdministrator(authorization), title: "Stock Pricing & Profit/Loss", generatedAt: new Date().toISOString(), currency: company[0].baseCurrency,
        description: "Current stock estimate before VAT, not realized sales profit. Unit cost uses the latest supplier bill plus allocated freight; Entered GRN price (or receipt cost when blank) is a fallback, never added twice. Freight Charges lines are allocated by stock purchase value (by quantity when all values are zero). Saved item cost is used when no purchase or GRN exists. Selling prices are current item prices. Negative stock is excluded from projected totals. All amounts are in home currency.",
        columns: [{ key: "inventory", label: "Inventory" }, { key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "quantity", label: "Stock qty" }, { key: "purchaseCost", label: "Purchase / unit", ...money }, { key: "freightCost", label: "Freight / unit", ...money }, { key: "grnCost", label: "GRN / unit", ...money }, { key: "totalCost", label: "Total cost / unit", ...money }, { key: "sellingPrice", label: "Selling / unit", ...money }, { key: "unitProfit", label: "Profit/Loss / unit", ...money }, { key: "margin", label: "Margin" }, { key: "stockCost", label: "Stock cost", ...money }, { key: "potentialProfit", label: "Potential stock profit/loss", ...money }, { key: "costSource", label: "Cost source" }],
        rows: stockPricingRows(stock, purchaseLines, inventories) } }, { headers: { "Cache-Control": "no-store" } });
    }
    const journalFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
    const [allTransactions, allContacts, allItems, allAccounts, ledger, journal, lines, configuredVatCodes, currentRates, locations, auditRows] = await Promise.all([
      db.select().from(transactions).where(and(eq(transactions.companyId, companyId), scoped ? eq(transactions.locationId, locationId) : undefined)).orderBy(asc(transactions.transactionDate), asc(transactions.id)),
      db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)),
      db.select().from(items).where(and(eq(items.companyId, companyId), scoped ? eq(items.locationId, locationId) : undefined)).orderBy(asc(items.name)),
      db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code)),
      db.select({ name: journalLines.accountName, debit: sum(journalLines.debit), credit: sum(journalLines.credit) }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).groupBy(journalLines.accountName).orderBy(asc(journalLines.accountName)),
      db.select({ date: journalEntries.entryDate, reference: journalEntries.reference, description: journalEntries.description, account: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).orderBy(asc(journalEntries.entryDate), asc(journalLines.id)),
      db.select({ itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, unitCost: transactionLines.unitCost, vatCode: transactionLines.vatCode, vatRate: transactionLines.vatRate, vatAmount: transactionLines.vatAmount, type: transactions.type, status: transactions.status, locationId: transactions.locationId, party: transactions.party, date: transactions.transactionDate, number: transactions.number, transactionCurrency: transactions.currency, exchangeRate: transactions.exchangeRate, isImport: transactions.isImport }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactions.companyId, companyId), scoped ? eq(transactions.locationId, locationId) : undefined)),
      db.select().from(vatCodes).where(eq(vatCodes.companyId, companyId)).orderBy(asc(vatCodes.code)),
      db.select().from(exchangeRates).where(and(eq(exchangeRates.companyId, companyId), eq(exchangeRates.active, true))),
      db.select().from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)),
      db.select().from(auditLog).where(eq(auditLog.companyId, companyId)).orderBy(asc(auditLog.createdAt), asc(auditLog.id)),
    ]);
    const accountTypes = new Map(allAccounts.map((account) => [account.name, account.type]));
    const ledgerRows = ledger.map((row) => ({ name: row.name, type: accountTypes.get(row.name) ?? "Unclassified", debit: Number(row.debit ?? 0), credit: Number(row.credit ?? 0), balance: Number(row.debit ?? 0) - Number(row.credit ?? 0) }));
    const incomeTypes = new Set(["Income", "Other Income"]);
    const expenseTypes = new Set(["Expense", "Cost of Goods Sold", "Other Expense"]);
    const assetTypes = new Set(["Bank", "Accounts Receivable", "Other Current Asset", "Fixed Asset", "Other Asset"]);
    const liabilityTypes = new Set(["Accounts Payable", "Other Current Liability", "Long Term Liability", "Loan", "Credit Card"]);
    const scopedTransactions = allTransactions.filter((row) => !Number.isInteger(locationId) || locationId <= 0 || row.locationId === locationId);
    const salesTypes = new Set(["invoice", "sales receipt", "statement charge", "finance charge"]);
    const purchaseTypes = new Set(["bill", "received item bill", "expense", "cheque", "credit card charge"]);
    const baseSubtotal = (row: typeof allTransactions[number]) => Number(row.subtotal) * Number(row.exchangeRate);
    const rateMap = new Map(currentRates.map((rate) => [rate.currencyCode, Number(rate.rate)]));
    const accountType = (name: string) => accountTypes.get(name) ?? "Unclassified";
    const pnlAmount = (entry: typeof journal[number]) => incomeTypes.has(accountType(entry.account)) ? Number(entry.credit) - Number(entry.debit) : expenseTypes.has(accountType(entry.account)) ? Number(entry.debit) - Number(entry.credit) : 0;
    const periodProfit = (start: string, end: string) => journal.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + (incomeTypes.has(accountType(entry.account)) ? Number(entry.credit) - Number(entry.debit) : -(expenseTypes.has(accountType(entry.account)) ? Number(entry.debit) - Number(entry.credit) : 0)), 0);
    const reportYear = new Date().getUTCFullYear();
    const budgetStart = periodStart || `${reportYear}-01-01`;
    const budgetEnd = periodEnd || `${reportYear}-12-31`;
    const priorBudgetStart = budgetStart.replace(/^\d{4}/, String(Number(budgetStart.slice(0, 4)) - 1));
    const priorBudgetEnd = budgetEnd.replace(/^\d{4}/, String(Number(budgetEnd.slice(0, 4)) - 1));
    const budgetAccountTotals = (start: string, end: string) => {
      const totals = new Map<string, number>();
      journal.filter((entry) => entry.date >= start && entry.date <= end && (incomeTypes.has(accountType(entry.account)) || expenseTypes.has(accountType(entry.account)))).forEach((entry) => totals.set(entry.account, (totals.get(entry.account) ?? 0) + pnlAmount(entry)));
      return totals;
    };
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
    const aged = (types: string[]) => scopedTransactions.filter((row) => types.includes(row.type) && !["paid", "cleared"].includes(row.status)).map((row) => {
      const age = row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0;
      return { name: row.party, current: age <= 0 ? row.baseTotal : 0, days30: age > 0 && age <= 30 ? row.baseTotal : 0, days60: age > 30 && age <= 60 ? row.baseTotal : 0, days90: age > 60 ? row.baseTotal : 0, total: row.baseTotal };
    });
    const agingColumns = [{ key: "name", label: "Name" }, { key: "current", label: "Current", ...money }, { key: "days30", label: "1–30", ...money }, { key: "days60", label: "31–60", ...money }, { key: "days90", label: "61+", ...money }, { key: "total", label: "Total", ...money }];
    const customerTypes = new Set(["invoice", "sales receipt", "statement charge", "finance charge", "customer payment", "credit memo"]);
    const customerActivities = scopedTransactions.filter((row) => customerTypes.has(row.type));
    const customerImpact = (row: typeof allTransactions[number]) => ["customer payment", "credit memo"].includes(row.type) ? -row.baseTotal : row.baseTotal;
    const customerSettlements: Array<{ customer: string; invoice: string; invoiceDate: string; payment: string; paymentDate: string; days: number; amount: number }> = [];
    const activityByCustomer = new Map<string, typeof customerActivities>();
    customerActivities.forEach((row) => activityByCustomer.set(row.party, [...(activityByCustomer.get(row.party) ?? []), row]));
    activityByCustomer.forEach((activity, customer) => {
      const openInvoices: Array<{ number: string; date: string; remaining: number; total: number }> = [];
      activity.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id).forEach((row) => {
        if (["invoice", "statement charge", "finance charge"].includes(row.type)) openInvoices.push({ number: row.number, date: row.transactionDate, remaining: row.baseTotal, total: row.baseTotal });
        if (row.type !== "customer payment") return;
        let paymentRemaining = row.baseTotal;
        while (paymentRemaining > 0.005 && openInvoices.length) {
          const invoice = openInvoices[0];
          const applied = Math.min(paymentRemaining, invoice.remaining);
          paymentRemaining -= applied;
          invoice.remaining -= applied;
          if (invoice.remaining <= 0.005) {
            const days = Math.max(0, Math.floor((new Date(row.transactionDate).getTime() - new Date(invoice.date).getTime()) / 86400000));
            customerSettlements.push({ customer, invoice: invoice.number, invoiceDate: invoice.date, payment: row.number, paymentDate: row.transactionDate, days, amount: invoice.total });
            openInvoices.shift();
          }
        }
      });
    });
    const supplierTypes = new Set(["bill", "received item bill", "expense", "cheque", "bill payment", "vendor credit", "purchase order", "item receipt"]);
    const supplierActivities = scopedTransactions.filter((row) => supplierTypes.has(row.type));
    const payableAccounts = new Set(allAccounts.filter((account) => account.systemRole === "AP" || account.type === "Accounts Payable").map((account) => account.name));
    const supplierImpact = (row: typeof allTransactions[number]) => ["bill payment", "vendor credit"].includes(row.type) || (row.type === "cheque" && payableAccounts.has(row.account)) ? -row.baseTotal : ["purchase order", "item receipt", "cheque"].includes(row.type) ? 0 : row.baseTotal;
    const vatDocumentTypes = new Set(["invoice", "sales receipt", "statement charge", "credit memo", "bill", "received item bill", "expense", "cheque", "credit card charge", "vendor credit"]);
    const vatLines = lines.filter((line) => vatDocumentTypes.has(line.type) && (!periodStart || line.date >= periodStart) && (!periodEnd || line.date <= periodEnd));
    const outputVat = vatLines.reduce((sum, line) => sum + (line.type === "credit memo" ? -1 : ["invoice", "sales receipt", "statement charge"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    const inputVat = vatLines.reduce((sum, line) => sum + (line.type === "vendor credit" ? -1 : ["bill", "received item bill", "expense", "cheque", "credit card charge"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    let summary: { income: number; expenses: number; netIncome: number } | undefined;
    let title = "Transaction List by Date";
    let columns: Array<{ key: string; label: string; type?: "money" }> = txColumns;
    let rows: Row[] = txRows();
    let chart: { labelKey: string; incomeKey: string; expenseKey: string; incomeLabel?: string; expenseLabel?: string } | undefined;

    if (key === "profit-loss") {
      title = "Profit & Loss Standard";
      rows = ledgerRows.filter((row) => incomeTypes.has(row.type) || expenseTypes.has(row.type)).map((row) => ({ name: row.name, type: row.type, amount: incomeTypes.has(row.type) ? -row.balance : row.balance }));
      const income = rows.filter((row) => incomeTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      const expenses = rows.filter((row) => expenseTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      summary = { income, expenses, netIncome: income - expenses };
      rows.push({ name: "Net income", amount: summary.netIncome });
      columns = [{ key: "name", label: "Account" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "profit-loss-detail") {
      title = "Profit & Loss Detail";
      rows = journal.filter((entry) => incomeTypes.has(accountType(entry.account)) || expenseTypes.has(accountType(entry.account))).map((entry) => ({ date: entry.date, reference: entry.reference, account: entry.account, description: entry.description, type: accountType(entry.account), amount: pnlAmount(entry) }));
      columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "account", label: "Account" }, { key: "description", label: "Description" }, { key: "type", label: "Class" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "profit-loss-ytd" || key === "profit-loss-prev-year") {
      const now = new Date();
      const year = now.getUTCFullYear();
      const monthDay = now.toISOString().slice(5, 10);
      const currentEnd = key === "profit-loss-ytd" ? `${year}-${monthDay}` : `${year}-12-31`;
      const priorEnd = key === "profit-loss-ytd" ? `${year - 1}-${monthDay}` : `${year - 1}-12-31`;
      title = key === "profit-loss-ytd" ? "Profit & Loss YTD Comparison" : "Profit & Loss Prev Year Comparison";
      const current = periodProfit(`${year}-01-01`, currentEnd);
      const previous = periodProfit(`${year - 1}-01-01`, priorEnd);
      rows = [{ period: String(year - 1), amount: previous, change: 0 }, { period: String(year), amount: current, change: current - previous }];
      columns = [{ key: "period", label: "Period" }, { key: "amount", label: "Net Income", ...money }, { key: "change", label: "Change", ...money }];
    } else if (key === "profit-loss-job" || key === "profit-loss-class") {
      title = key === "profit-loss-job" ? "Profit & Loss by Job" : "Profit & Loss by Class";
      const locationNames = new Map(locations.map((location) => [location.id, location.name]));
      const grouped = new Map<string, { income: number; expenses: number }>();
      scopedTransactions.forEach((row) => {
        const name = key === "profit-loss-job" ? locationNames.get(row.locationId ?? 0) ?? "Unassigned" : row.type;
        const old = grouped.get(name) ?? { income: 0, expenses: 0 };
        if (salesTypes.has(row.type)) old.income += baseSubtotal(row);
        if (purchaseTypes.has(row.type)) old.expenses += baseSubtotal(row);
        grouped.set(name, old);
      });
      rows = [...grouped].map(([name, value]) => ({ name, ...value, netIncome: value.income - value.expenses }));
      columns = [{ key: "name", label: key === "profit-loss-job" ? "Job / Inventory" : "Class" }, { key: "income", label: "Income", ...money }, { key: "expenses", label: "Expenses", ...money }, { key: "netIncome", label: "Net Income", ...money }];
    } else if (key === "profit-loss-unclassified") {
      title = "Profit & Loss Unclassified";
      rows = journal.filter((entry) => !accountTypes.has(entry.account)).map((entry) => ({ date: entry.date, reference: entry.reference, account: entry.account, description: entry.description, debit: entry.debit, credit: entry.credit }));
      columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "account", label: "Unclassified Account" }, { key: "description", label: "Description" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }];
    } else if (key === "income-customer-summary" || key === "expenses-supplier-summary") {
      const income = key === "income-customer-summary";
      title = income ? "Income by Customer Summary" : "Expenses by Supplier Summary";
      const grouped = new Map<string, number>();
      scopedTransactions.filter((row) => income ? salesTypes.has(row.type) : purchaseTypes.has(row.type)).forEach((row) => grouped.set(row.party, (grouped.get(row.party) ?? 0) + baseSubtotal(row)));
      rows = [...grouped].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
      columns = [{ key: "name", label: income ? "Customer" : "Supplier" }, { key: "amount", label: income ? "Income" : "Expenses", ...money }];
    } else if (key === "income-customer-detail" || key === "expenses-supplier-detail") {
      const income = key === "income-customer-detail";
      title = income ? "Income by Customer Detail" : "Expenses by Supplier Detail";
      rows = scopedTransactions.filter((row) => income ? salesTypes.has(row.type) : purchaseTypes.has(row.type)).map((row) => ({ date: row.transactionDate, number: row.number, name: row.party, type: row.type, currency: row.currency, amount: baseSubtotal(row) }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "name", label: income ? "Customer" : "Supplier" }, { key: "type", label: "Type" }, { key: "currency", label: "Currency" }, { key: "amount", label: income ? "Income" : "Expenses", ...money }];
    } else if (key === "income-expense-graph") {
      title = "Income & Expense Graph";
      const months = new Map<string, { income: number; expenses: number }>();
      scopedTransactions.forEach((row) => { const month = row.transactionDate.slice(0, 7); const old = months.get(month) ?? { income: 0, expenses: 0 }; if (salesTypes.has(row.type)) old.income += baseSubtotal(row); if (purchaseTypes.has(row.type)) old.expenses += baseSubtotal(row); months.set(month, old); });
      rows = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, ...value, net: value.income - value.expenses }));
      columns = [{ key: "month", label: "Month" }, { key: "income", label: "Income", ...money }, { key: "expenses", label: "Expenses", ...money }, { key: "net", label: "Net", ...money }];
      chart = { labelKey: "month", incomeKey: "income", expenseKey: "expenses" };
    } else if (key === "realised-gains-losses" || key === "unrealised-gains-losses") {
      const realised = key === "realised-gains-losses";
      title = realised ? "Realised Gains & Losses" : "Unrealised Gains & Losses";
      rows = scopedTransactions.filter((row) => row.currency !== currency && (realised ? ["paid", "cleared"].includes(row.status) || ["customer payment", "bill payment"].includes(row.type) : !["paid", "cleared"].includes(row.status))).map((row) => { const currentRate = rateMap.get(row.currency) ?? row.exchangeRate; const currentValue = row.total * currentRate; return { date: row.transactionDate, number: row.number, name: row.party, currency: row.currency, bookedRate: row.exchangeRate, currentRate, bookedValue: row.baseTotal, currentValue, gainLoss: currentValue - row.baseTotal }; });
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "name", label: "Name" }, { key: "currency", label: "Currency" }, { key: "bookedRate", label: "Booked Rate" }, { key: "currentRate", label: realised ? "Settlement Rate" : "Current Rate" }, { key: "bookedValue", label: "Booked Value", ...money }, { key: "currentValue", label: "Revalued Value", ...money }, { key: "gainLoss", label: "Gain / Loss", ...money }];
    } else if (key === "balance-sheet" || key === "balance-sheet-detail") {
      title = key === "balance-sheet-detail" ? "Balance Sheet Detail" : "Balance Sheet Standard";
      rows = ledgerRows.filter((row) => assetTypes.has(row.type) || liabilityTypes.has(row.type) || row.type === "Equity").map((row) => ({ name: row.name, section: assetTypes.has(row.type) ? "Assets" : liabilityTypes.has(row.type) ? "Liabilities" : "Equity", debit: row.debit, credit: row.credit, amount: assetTypes.has(row.type) ? row.balance : -row.balance }));
      columns = key === "balance-sheet-detail" ? [{ key: "section", label: "Section" }, { key: "name", label: "Account" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "amount", label: "Balance", ...money }] : [{ key: "section", label: "Section" }, { key: "name", label: "Account" }, { key: "amount", label: "Balance", ...money }];
    } else if (key === "balance-sheet-summary") {
      title = "Balance Sheet Summary";
      const sections = new Map<string, number>();
      ledgerRows.filter((row) => assetTypes.has(row.type) || liabilityTypes.has(row.type) || row.type === "Equity").forEach((row) => { const section = assetTypes.has(row.type) ? "Assets" : liabilityTypes.has(row.type) ? "Liabilities" : "Equity"; sections.set(section, (sections.get(section) ?? 0) + (section === "Assets" ? row.balance : -row.balance)); });
      rows = [...sections].map(([section, amount]) => ({ section, amount }));
      columns = [{ key: "section", label: "Section" }, { key: "amount", label: "Balance", ...money }];
    } else if (key === "balance-sheet-prev-year") {
      title = "Balance Sheet Prev Year Comparison";
      const year = new Date().getUTCFullYear();
      const balanceAt = (end: string) => {
        const grouped = new Map<string, { debit: number; credit: number }>();
        journal.filter((entry) => entry.date <= end).forEach((entry) => { const old = grouped.get(entry.account) ?? { debit: 0, credit: 0 }; grouped.set(entry.account, { debit: old.debit + Number(entry.debit), credit: old.credit + Number(entry.credit) }); });
        return grouped;
      };
      const current = balanceAt(`${year}-12-31`); const previous = balanceAt(`${year - 1}-12-31`);
      rows = allAccounts.filter((account) => assetTypes.has(account.type) || liabilityTypes.has(account.type) || account.type === "Equity").map((account) => { const sign = assetTypes.has(account.type) ? 1 : -1; const now = current.get(account.name) ?? { debit: 0, credit: 0 }; const before = previous.get(account.name) ?? { debit: 0, credit: 0 }; const currentBalance = sign * (now.debit - now.credit); const previousBalance = sign * (before.debit - before.credit); return { name: account.name, section: assetTypes.has(account.type) ? "Assets" : liabilityTypes.has(account.type) ? "Liabilities" : "Equity", previous: previousBalance, current: currentBalance, change: currentBalance - previousBalance }; });
      columns = [{ key: "section", label: "Section" }, { key: "name", label: "Account" }, { key: "previous", label: String(year - 1), ...money }, { key: "current", label: String(year), ...money }, { key: "change", label: "Change", ...money }];
    } else if (key === "net-worth-graph") {
      title = "Net Worth Graph";
      const year = new Date().getUTCFullYear();
      rows = Array.from({ length: 12 }, (_, month) => { const end = `${year}-${String(month + 1).padStart(2, "0")}-31`; let assets = 0; let liabilities = 0; journal.filter((entry) => entry.date <= end).forEach((entry) => { const type = accountType(entry.account); const balance = Number(entry.debit) - Number(entry.credit); if (assetTypes.has(type)) assets += balance; if (liabilityTypes.has(type)) liabilities -= balance; }); return { month: `${year}-${String(month + 1).padStart(2, "0")}`, assets, liabilities, netWorth: assets - liabilities }; });
      columns = [{ key: "month", label: "Month" }, { key: "assets", label: "Assets", ...money }, { key: "liabilities", label: "Liabilities", ...money }, { key: "netWorth", label: "Net Worth", ...money }];
      chart = { labelKey: "month", incomeKey: "assets", expenseKey: "liabilities" };
    } else if (key === "budget-overview" || key === "budget-actual") {
      title = key === "budget-overview" ? "Budget Overview" : "Budget vs. Actual";
      const budget = budgetAccountTotals(priorBudgetStart, priorBudgetEnd);
      const actual = budgetAccountTotals(budgetStart, budgetEnd);
      rows = allAccounts.filter((account) => incomeTypes.has(account.type) || expenseTypes.has(account.type)).map((account) => { const budgetAmount = budget.get(account.name) ?? 0; const actualAmount = actual.get(account.name) ?? 0; return { code: account.code, account: account.name, section: incomeTypes.has(account.type) ? "Income" : "Expenses", budget: budgetAmount, actual: actualAmount, variance: incomeTypes.has(account.type) ? actualAmount - budgetAmount : budgetAmount - actualAmount, performance: budgetAmount ? `${(actualAmount / budgetAmount * 100).toFixed(1)}%` : "—" }; });
      columns = [{ key: "code", label: "Code" }, { key: "account", label: "Account" }, { key: "section", label: "Section" }, { key: "budget", label: "Budget", ...money }, { key: "actual", label: "Actual", ...money }, { key: "variance", label: "Favourable Variance", ...money }, { key: "performance", label: "Performance" }];
    } else if (key === "budget-profit-loss") {
      title = "Profit & Loss Budget Performance";
      const budget = budgetAccountTotals(priorBudgetStart, priorBudgetEnd);
      const actual = budgetAccountTotals(budgetStart, budgetEnd);
      const totals = (source: Map<string, number>, types: Set<string>) => [...source].filter(([account]) => types.has(accountType(account))).reduce((sum, [, amount]) => sum + amount, 0);
      const budgetIncome = totals(budget, incomeTypes); const actualIncome = totals(actual, incomeTypes); const budgetExpenses = totals(budget, expenseTypes); const actualExpenses = totals(actual, expenseTypes);
      rows = [
        { section: "Income", budget: budgetIncome, actual: actualIncome, variance: actualIncome - budgetIncome },
        { section: "Expenses", budget: budgetExpenses, actual: actualExpenses, variance: budgetExpenses - actualExpenses },
        { section: "Net Profit", budget: budgetIncome - budgetExpenses, actual: actualIncome - actualExpenses, variance: (actualIncome - actualExpenses) - (budgetIncome - budgetExpenses) },
      ].map((row) => ({ ...row, performance: row.budget ? `${(row.actual / row.budget * 100).toFixed(1)}%` : "—" }));
      columns = [{ key: "section", label: "Profit & Loss" }, { key: "budget", label: "Budget", ...money }, { key: "actual", label: "Actual", ...money }, { key: "variance", label: "Favourable Variance", ...money }, { key: "performance", label: "Performance" }];
    } else if (key === "budget-actual-graph") {
      title = "Budget vs. Actual Graph";
      const selectedYear = Number(budgetStart.slice(0, 4));
      rows = Array.from({ length: 12 }, (_, index) => { const month = String(index + 1).padStart(2, "0"); const actualStart = `${selectedYear}-${month}-01`; const actualEnd = `${selectedYear}-${month}-31`; const budgetMonthStart = `${selectedYear - 1}-${month}-01`; const budgetMonthEnd = `${selectedYear - 1}-${month}-31`; return { month: `${selectedYear}-${month}`, budget: periodProfit(budgetMonthStart, budgetMonthEnd), actual: periodProfit(actualStart, actualEnd) }; }).map((row) => ({ ...row, variance: row.actual - row.budget }));
      columns = [{ key: "month", label: "Month" }, { key: "budget", label: "Budget", ...money }, { key: "actual", label: "Actual", ...money }, { key: "variance", label: "Variance", ...money }];
      chart = { labelKey: "month", incomeKey: "actual", expenseKey: "budget", incomeLabel: "Actual", expenseLabel: "Budget" };
    } else if (key === "trial-balance") {
      title = "Trial Balance"; rows = ledgerRows; columns = amountColumns();
    } else if (key === "general-ledger" || key === "journal") {
      title = key === "journal" ? "Journal" : "General Ledger";
      const balances = new Map<string, number>();
      rows = journal.map((entry) => { const balance = (balances.get(entry.account) ?? 0) + Number(entry.debit) - Number(entry.credit); balances.set(entry.account, balance); return { ...entry, balance }; });
      columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "account", label: "Account" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, ...(key === "general-ledger" ? [{ key: "balance", label: "Running Balance", ...money }] : [])];
    } else if (key === "transaction-detail-account") {
      title = "Transaction Detail by Account";
      const balances = new Map<string, number>();
      rows = journal.map((entry) => { const balance = (balances.get(entry.account) ?? 0) + Number(entry.debit) - Number(entry.credit); balances.set(entry.account, balance); return { account: entry.account, date: entry.date, reference: entry.reference, description: entry.description, debit: entry.debit, credit: entry.credit, balance }; }).sort((a, b) => a.account.localeCompare(b.account) || a.date.localeCompare(b.date));
      columns = [{ key: "account", label: "Account" }, { key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Running Balance", ...money }];
    } else if (key === "audit-trail") {
      title = "Audit Trail";
      rows = auditRows.map((entry) => ({ date: String(entry.createdAt), action: entry.action, entity: entry.entityType.replaceAll("_", " "), entityId: entry.entityId, details: entry.details || "—" })).reverse();
      columns = [{ key: "date", label: "Date / Time" }, { key: "action", label: "Action" }, { key: "entity", label: "Record Type" }, { key: "entityId", label: "Record ID" }, { key: "details", label: "Details" }];
    } else if (key === "customer-credit-card-audit") {
      title = "Customer Credit Card Audit Trail";
      rows = scopedTransactions.filter((row) => row.type === "credit card charge" || row.account.toLowerCase().includes("credit card")).map((row) => ({ date: row.transactionDate, number: row.number, customer: row.party || "—", account: row.account, status: row.status, currency: row.currency, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "Reference" }, { key: "customer", label: "Customer / Payee" }, { key: "account", label: "Credit Card Account" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "deleted-transactions-summary") {
      title = "Voided/Deleted Transactions Summary";
      const grouped = new Map<string, { records: number; details: string }>();
      auditRows.filter((entry) => entry.entityType === "transaction" && ["deleted", "voided"].includes(entry.action)).forEach((entry) => { const action = entry.action === "voided" ? "Voided" : "Deleted"; const old = grouped.get(action) ?? { records: 0, details: "Transaction records preserved in audit history" }; old.records += 1; grouped.set(action, old); });
      rows = [...grouped].map(([action, value]) => ({ action, ...value }));
      columns = [{ key: "action", label: "Action" }, { key: "records", label: "Transactions" }, { key: "details", label: "Audit Status" }];
    } else if (key === "deleted-transactions-detail") {
      title = "Voided/Deleted Transactions Detail";
      rows = auditRows.filter((entry) => entry.entityType === "transaction" && ["deleted", "voided"].includes(entry.action)).map((entry) => ({ date: String(entry.createdAt), action: entry.action === "voided" ? "Voided" : "Deleted", transactionId: entry.entityId, details: entry.details || "—" })).reverse();
      columns = [{ key: "date", label: "Date / Time" }, { key: "action", label: "Action" }, { key: "transactionId", label: "Transaction ID" }, { key: "details", label: "Transaction Details" }];
    } else if (key === "transactions") {
      title = "Transaction List by Date";
      rows = scopedTransactions.map((row) => ({ date: row.transactionDate, number: row.number, type: row.type, name: row.party || "—", account: row.account, status: row.status, currency: row.currency, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "account", label: "Account" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "transaction-history") {
      title = "Transaction History";
      const documentHistory: Row[] = scopedTransactions.map((row) => ({ date: row.transactionDate, event: "Document", reference: row.number, type: row.type, name: row.party || "—", details: row.memo || row.status, amount: row.baseTotal }));
      const auditHistory: Row[] = auditRows.map((entry) => ({ date: String(entry.createdAt), event: entry.action.replace(/^./, (letter) => letter.toUpperCase()), reference: `${entry.entityType.replaceAll("_", " ")} #${entry.entityId}`, type: entry.entityType.replaceAll("_", " "), name: "—", details: entry.details || "—", amount: 0 }));
      rows = [...documentHistory, ...auditHistory].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      columns = [{ key: "date", label: "Date / Time" }, { key: "event", label: "Event" }, { key: "reference", label: "Reference" }, { key: "type", label: "Record Type" }, { key: "name", label: "Name" }, { key: "details", label: "Details" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "transaction-journal") {
      title = "Transaction Journal";
      const transactionByNumber = new Map(scopedTransactions.map((row) => [row.number, row]));
      rows = journal.filter((entry) => transactionByNumber.has(entry.reference)).map((entry) => { const source = transactionByNumber.get(entry.reference)!; return { date: entry.date, reference: entry.reference, type: source.type, name: source.party || "—", account: entry.account, description: entry.description, debit: entry.debit, credit: entry.credit, status: source.status }; });
      columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Transaction No." }, { key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "account", label: "Account" }, { key: "description", label: "Description" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "status", label: "Status" }];
    } else if (key === "account-listing") {
      title = "Account Listing";
      const namesById = new Map(allAccounts.map((account) => [account.id, account.name]));
      rows = allAccounts.map((account) => ({ code: account.code, name: account.name, type: account.type, parent: account.parentAccountId ? namesById.get(account.parentAccountId) ?? "—" : "—", role: account.systemRole ?? "—", currency: account.currency, status: account.active ? "Active" : "Inactive", balance: account.balance }));
      columns = [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "type", label: "Type" }, { key: "parent", label: "Sub-account Of" }, { key: "role", label: "System Link" }, { key: "currency", label: "Currency" }, { key: "status", label: "Status" }, { key: "balance", label: "Opening Balance", ...money }];
    } else if (key === "fixed-asset-listing") {
      title = "Fixed Asset Listing";
      const balancesByAccount = new Map(ledgerRows.map((row) => [row.name, row]));
      rows = allAccounts.filter((account) => account.type === "Fixed Asset").map((account) => { const posted = balancesByAccount.get(account.name); return { code: account.code, name: account.name, currency: account.currency, debit: posted?.debit ?? 0, credit: posted?.credit ?? 0, balance: (posted?.balance ?? 0) + account.balance, status: account.active ? "Active" : "Inactive" }; });
      columns = [{ key: "code", label: "Code" }, { key: "name", label: "Fixed Asset Account" }, { key: "currency", label: "Currency" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Book Balance", ...money }, { key: "status", label: "Status" }];
    } else if (key === "cash-flow") {
      title = "Statement of Cash Flows";
      const bankAccounts = new Set(allAccounts.filter((account) => account.systemRole === "BANK" || account.type === "Bank").map((account) => account.name));
      rows = ledgerRows.filter((row) => bankAccounts.has(row.name)).map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Activity" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "cash-flow-forecast") {
      title = "Cash Flow Forecast";
      const bankAccounts = new Set(allAccounts.filter((account) => account.systemRole === "BANK" || account.type === "Bank").map((account) => account.name));
      let projected = ledgerRows.filter((row) => bankAccounts.has(row.name)).reduce((sum, row) => sum + row.balance, 0);
      const periods = new Map<string, { inflow: number; outflow: number }>();
      scopedTransactions.filter((row) => !["paid", "cleared"].includes(row.status) && (["invoice", "statement charge", "finance charge", "bill", "received item bill"].includes(row.type))).forEach((row) => { const month = (row.dueDate || row.transactionDate).slice(0, 7); const old = periods.get(month) ?? { inflow: 0, outflow: 0 }; if (["invoice", "statement charge", "finance charge"].includes(row.type)) old.inflow += row.baseTotal; else old.outflow += row.baseTotal; periods.set(month, old); });
      rows = [...periods].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => { projected += value.inflow - value.outflow; return { month, ...value, projected }; });
      columns = [{ key: "month", label: "Due Month" }, { key: "inflow", label: "Expected Inflow", ...money }, { key: "outflow", label: "Expected Outflow", ...money }, { key: "projected", label: "Projected Cash", ...money }];
    } else if (key === "bank-register") {
      title = "Bank Register";
      const bankAccounts = new Set(allAccounts.filter((account) => account.systemRole === "BANK" || account.type === "Bank").map((account) => account.name));
      const balances = new Map<string, number>();
      rows = journal.filter((row) => bankAccounts.has(row.account)).map((row) => {
        const balance = (balances.get(row.account) ?? 0) + Number(row.debit) - Number(row.credit);
        balances.set(row.account, balance);
        return { account: row.account, date: row.date, reference: row.reference, description: row.description, debit: row.debit, credit: row.credit, balance };
      });
      columns = [{ key: "account", label: "Bank Account" }, { key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "debit", label: "Debit", ...money }, { key: "credit", label: "Credit", ...money }, { key: "balance", label: "Balance", ...money }];
    } else if (key === "bank-reconciliation") {
      title = "Bank Reconciliation";
      rows = allTransactions.filter((row) => (!Number.isInteger(locationId) || locationId <= 0 || row.locationId === locationId) && ["deposit", "cheque", "transfer", "credit card charge", "customer payment", "bill payment"].includes(row.type)).map((row) => ({ date: row.transactionDate, number: row.number, type: row.type, party: row.party, status: row.status === "cleared" ? "Cleared" : "Uncleared", amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "Reference" }, { key: "type", label: "Type" }, { key: "party", label: "Name / Account" }, { key: "status", label: "Reconciliation Status" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "ar-aging-summary") {
      title = "A/R Aging Summary";
      const grouped = new Map<string, { current: number; days30: number; days60: number; days90: number; total: number }>();
      aged(["invoice", "statement charge", "finance charge"]).forEach((row) => { const old = grouped.get(row.name) ?? { current: 0, days30: 0, days60: 0, days90: 0, total: 0 }; grouped.set(row.name, { current: old.current + row.current, days30: old.days30 + row.days30, days60: old.days60 + row.days60, days90: old.days90 + row.days90, total: old.total + row.total }); });
      rows = [...grouped].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.total - a.total);
      columns = agingColumns;
    } else if (key === "ar-aging-detail") {
      title = "A/R Aging Detail";
      rows = scopedTransactions.filter((row) => ["invoice", "statement charge", "finance charge"].includes(row.type) && !["paid", "cleared"].includes(row.status)).map((row) => { const age = row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0; return { customer: row.party, date: row.transactionDate, dueDate: row.dueDate || "—", number: row.number, status: row.status, age, amount: row.baseTotal }; });
      columns = [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "dueDate", label: "Due Date" }, { key: "number", label: "No." }, { key: "status", label: "Status" }, { key: "age", label: "Days Overdue" }, { key: "amount", label: "Open Amount", ...money }];
    } else if (key === "ap-aging-summary") {
      title = "A/P Aging Summary";
      const grouped = new Map<string, { current: number; days30: number; days60: number; days90: number; total: number }>();
      aged(["bill", "received item bill"]).forEach((row) => { const old = grouped.get(row.name) ?? { current: 0, days30: 0, days60: 0, days90: 0, total: 0 }; grouped.set(row.name, { current: old.current + row.current, days30: old.days30 + row.days30, days60: old.days60 + row.days60, days90: old.days90 + row.days90, total: old.total + row.total }); });
      rows = [...grouped].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.total - a.total);
      columns = agingColumns;
    } else if (key === "ap-aging-detail") {
      title = "A/P Aging Detail";
      rows = scopedTransactions.filter((row) => ["bill", "received item bill"].includes(row.type) && !["paid", "cleared"].includes(row.status)).map((row) => { const age = row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0; return { supplier: row.party, date: row.transactionDate, dueDate: row.dueDate || "—", number: row.number, status: row.status, age, amount: row.baseTotal }; });
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "dueDate", label: "Due Date" }, { key: "number", label: "No." }, { key: "status", label: "Status" }, { key: "age", label: "Days Overdue" }, { key: "amount", label: "Open Amount", ...money }];
    } else if (key === "customer-statements" || key === "vendor-statements") {
      const vendor = key === "vendor-statements";
      const partyType = vendor ? "vendor" : "customer";
      const memo = (url.searchParams.get("memo") || "").slice(0, 2000);
      const selectedCurrency = url.searchParams.get("currency") || currency;
      const customer = url.searchParams.get("customer") || "";
      const statementDate = url.searchParams.get("statementDate") || new Date().toISOString().slice(0, 10);
      const end = periodEnd || statementDate;
      const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
      if (!validDate(statementDate) || !validDate(end) || (periodStart && !validDate(periodStart)) || (periodStart && periodStart > end) || end > statementDate) return Response.json({ error: "Choose valid dates: From must be on or before To, and To on or before the statement date." }, { status: 400 });
      if (!/^[A-Z]{3}$/.test(selectedCurrency)) return Response.json({ error: "Select a valid currency." }, { status: 400 });
      const customers = allContacts.filter((contact) => contact.type === partyType);
      if (customer && !customers.some((contact) => contact.name === customer)) return Response.json({ error: `Select a ${partyType} in this company.` }, { status: 400 });
      const activity = allTransactions.filter((row) => row.currency === selectedCurrency && (!customer || row.party === customer) && row.transactionDate <= end && (vendor ? ["bill", "received item bill", "bill payment", "vendor payment", "vendor credit"].includes(row.type) || (row.type === "cheque" && payableAccounts.has(row.account)) : ["invoice", "statement charge", "finance charge", "customer payment", "credit memo"].includes(row.type)));
      const balances = new Map<string, number>();
      const round = (value: number) => Math.round(value * 100) / 100;
      let opening = 0, charges = 0, credits = 0;
      rows = [];
      for (const row of activity) {
        const debit = (vendor ? ["bill", "received item bill"] : ["invoice", "statement charge", "finance charge"]).includes(row.type) ? row.total : 0;
        const credit = (vendor ? ["bill payment", "vendor payment", "vendor credit", "cheque"] : ["customer payment", "credit memo"]).includes(row.type) ? row.total : 0;
        const balance = round((balances.get(row.party) || 0) + debit - credit);
        balances.set(row.party, balance);
        if (periodStart && row.transactionDate < periodStart) { opening = round(opening + debit - credit); continue; }
        charges = round(charges + debit); credits = round(credits + credit);
        rows.push({ customer: row.party, date: row.transactionDate, number: row.number, type: row.type, memo: row.memo || "", debit, credit, balance });
      }
      columns = [{ key: "customer", label: vendor ? "Vendor" : "Customer" }, { key: "date", label: "Date" }, { key: "number", label: "Reference" }, { key: "type", label: "Activity" }, { key: "memo", label: "Memo" }, { key: "debit", label: "Charges", ...money }, { key: "credit", label: "Payments / Credits", ...money }, { key: "balance", label: "Balance", ...money }];
      return Response.json({ report: { key, companyId, title: vendor ? "Vendor Statements" : "Customer Statements", generatedAt: new Date().toISOString(), currency: selectedCurrency, columns, rows,
        statement: { partyType, memo, customer, statementDate, from: periodStart, to: end, opening, charges, credits, closing: round(opening + charges - credits), customers: customers.map((contact) => ({ name: contact.name, currency: contact.currency })) }
      } }, { headers: { "Cache-Control": "no-store" } });
    } else if (key === "customer-balance-detail") {
      title = "Customer Balance Detail";
      const balances = new Map<string, number>();
      rows = customerActivities.map((row) => { const amount = customerImpact(row); const balance = (balances.get(row.party) ?? 0) + amount; balances.set(row.party, balance); return { customer: row.party, date: row.transactionDate, number: row.number, type: row.type, charge: amount > 0 ? amount : 0, payment: amount < 0 ? -amount : 0, balance }; });
      columns = [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "charge", label: "Charge", ...money }, { key: "payment", label: "Payment / Credit", ...money }, { key: "balance", label: "Balance", ...money }];
    } else if (key === "collections-report") {
      title = "Collections Report";
      const contactByName = new Map(allContacts.filter((contact) => contact.type === "customer").map((contact) => [contact.name, contact]));
      const grouped = new Map<string, { openInvoices: number; overdueInvoices: number; oldestDueDate: string; balance: number }>();
      customerActivities.forEach((row) => { const old = grouped.get(row.party) ?? { openInvoices: 0, overdueInvoices: 0, oldestDueDate: "", balance: 0 }; old.balance += customerImpact(row); if (["invoice", "statement charge", "finance charge"].includes(row.type) && !["paid", "cleared"].includes(row.status)) { old.openInvoices += 1; if (row.dueDate && row.dueDate < new Date().toISOString().slice(0, 10)) old.overdueInvoices += 1; if (row.dueDate && (!old.oldestDueDate || row.dueDate < old.oldestDueDate)) old.oldestDueDate = row.dueDate; } grouped.set(row.party, old); });
      rows = [...grouped].filter(([, value]) => value.balance > 0.005).map(([customer, value]) => ({ customer, phone: contactByName.get(customer)?.phone || "—", email: contactByName.get(customer)?.email || "—", openInvoices: value.openInvoices, overdueInvoices: value.overdueInvoices, oldestDueDate: value.oldestDueDate || "—", balance: value.balance })).sort((a, b) => b.balance - a.balance);
      columns = [{ key: "customer", label: "Customer" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "openInvoices", label: "Open" }, { key: "overdueInvoices", label: "Overdue" }, { key: "oldestDueDate", label: "Oldest Due" }, { key: "balance", label: "Balance", ...money }];
    } else if (key === "average-days-to-pay-summary") {
      title = "Average Days to Pay Summary";
      const grouped = new Map<string, { invoices: number; days: number; amount: number }>();
      customerSettlements.forEach((row) => { const old = grouped.get(row.customer) ?? { invoices: 0, days: 0, amount: 0 }; grouped.set(row.customer, { invoices: old.invoices + 1, days: old.days + row.days, amount: old.amount + row.amount }); });
      rows = [...grouped].map(([customer, value]) => ({ customer, invoices: value.invoices, averageDays: Math.round(value.days / value.invoices), paidAmount: value.amount })).sort((a, b) => b.averageDays - a.averageDays);
      columns = [{ key: "customer", label: "Customer" }, { key: "invoices", label: "Paid Invoices" }, { key: "averageDays", label: "Average Days" }, { key: "paidAmount", label: "Paid Amount", ...money }];
    } else if (key === "average-days-to-pay-detail") {
      title = "Average Days to Pay";
      rows = customerSettlements;
      columns = [{ key: "customer", label: "Customer" }, { key: "invoice", label: "Invoice" }, { key: "invoiceDate", label: "Invoice Date" }, { key: "payment", label: "Payment" }, { key: "paymentDate", label: "Payment Date" }, { key: "days", label: "Days to Pay" }, { key: "amount", label: "Invoice Amount", ...money }];
    } else if (key === "accounts-receivable-graph") {
      title = "Accounts Receivable Graph";
      const months = new Map<string, { charges: number; payments: number }>();
      customerActivities.forEach((row) => { const month = row.transactionDate.slice(0, 7); const old = months.get(month) ?? { charges: 0, payments: 0 }; if (["customer payment", "credit memo"].includes(row.type)) old.payments += row.baseTotal; else old.charges += row.baseTotal; months.set(month, old); });
      let balance = 0;
      rows = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => { balance += value.charges - value.payments; return { month, ...value, balance }; });
      columns = [{ key: "month", label: "Month" }, { key: "charges", label: "Charges", ...money }, { key: "payments", label: "Payments", ...money }, { key: "balance", label: "A/R Balance", ...money }];
      chart = { labelKey: "month", incomeKey: "charges", expenseKey: "payments" };
    } else if (key === "unbilled-costs-job") {
      title = "Unbilled Costs by Job";
      const locationNames = new Map(locations.map((location) => [location.id, location.name]));
      const grouped = new Map<string, { documents: number; amount: number }>();
      scopedTransactions.filter((row) => ["purchase order", "item receipt"].includes(row.type) && !["paid", "closed", "billed", "cancelled", "converted"].includes(row.status)).forEach((row) => { const job = locationNames.get(row.locationId ?? 0) ?? "Unassigned"; const old = grouped.get(job) ?? { documents: 0, amount: 0 }; grouped.set(job, { documents: old.documents + 1, amount: old.amount + row.baseTotal }); });
      rows = [...grouped].map(([job, value]) => ({ job, ...value })).sort((a, b) => b.amount - a.amount);
      columns = [{ key: "job", label: "Job / Inventory" }, { key: "documents", label: "Open Documents" }, { key: "amount", label: "Unbilled Cost", ...money }];
    } else if (key === "customer-transactions") {
      title = "Transaction List by Customer";
      rows = customerActivities.map((row) => ({ customer: row.party, date: row.transactionDate, number: row.number, type: row.type, status: row.status, amount: customerImpact(row) }));
      columns = [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "amount", label: "Net Amount", ...money }];
    } else if (key === "online-received-payments") {
      title = "Online Received Payments";
      rows = scopedTransactions.filter((row) => row.type === "customer payment").map((row) => ({ date: row.transactionDate, number: row.number, customer: row.party, account: row.account, status: row.status, currency: row.currency, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "Payment No." }, { key: "customer", label: "Customer" }, { key: "account", label: "Deposit Account" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "customer-phone-list") {
      title = "Customer Phone List";
      rows = allContacts.filter((row) => row.type === "customer").map((row) => ({ customer: row.name, company: row.company || "—", phone: row.phone || "—", whatsapp: row.whatsapp || "—", country: row.country || "—" }));
      columns = [{ key: "customer", label: "Customer" }, { key: "company", label: "Company" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "country", label: "Country" }];
    } else if (key === "customer-contact-list") {
      title = "Customer Contact List";
      rows = allContacts.filter((row) => row.type === "customer").map((row) => ({ customer: row.name, company: row.company || "—", email: row.email || "—", phone: row.phone || "—", whatsapp: row.whatsapp || "—", country: row.country || "—", currency: row.currency, status: row.status }));
      columns = [{ key: "customer", label: "Customer" }, { key: "company", label: "Company" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "country", label: "Country" }, { key: "currency", label: "Currency" }, { key: "status", label: "Status" }];
    } else if (key === "item-price-list") {
      title = "Item Price List";
      rows = allItems.filter((row) => row.status === "active").map((row) => ({ itemNumber: row.itemNumber || "—", sku: row.sku, item: row.name, category: row.category, quantity: row.quantity, price: row.salesPrice }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "item", label: "Item" }, { key: "category", label: "Category" }, { key: "quantity", label: "On Hand" }, { key: "price", label: "Sales Price", ...money }];
    } else if (key === "item-price-level-list") {
      title = "Item Price List for Price Level";
      rows = allItems.map((item) => ({ itemNumber: item.itemNumber || "—", sku: item.sku, item: item.name, level: "Default Selling Price", cost: item.cost, price: item.salesPrice, margin: item.salesPrice ? `${((item.salesPrice - item.cost) / item.salesPrice * 100).toFixed(1)}%` : "—", status: item.status }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "item", label: "Item" }, { key: "level", label: "Price Level" }, { key: "cost", label: "Cost", ...money }, { key: "price", label: "Selling Price", ...money }, { key: "margin", label: "Margin" }, { key: "status", label: "Status" }];
    } else if (key === "item-listing") {
      title = "Item Listing";
      rows = allItems.map((item) => ({ itemNumber: item.itemNumber || "—", sku: item.sku, item: item.name, category: item.category, quantity: item.quantity, reorder: item.reorderPoint, cost: item.cost, price: item.salesPrice, status: item.status }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "item", label: "Item" }, { key: "category", label: "Category" }, { key: "quantity", label: "On Hand" }, { key: "reorder", label: "Reorder" }, { key: "cost", label: "Cost", ...money }, { key: "price", label: "Selling Price", ...money }, { key: "status", label: "Status" }];
    } else if (key === "employee-contact-list") {
      title = "Employee Contact List";
      rows = allContacts.filter((contact) => contact.type === "employee").map((contact) => ({ name: contact.name, company: contact.company || "—", phone: contact.phone || "—", whatsapp: contact.whatsapp || "—", email: contact.email || "—", country: contact.country || "—", status: contact.status }));
      columns = [{ key: "name", label: "Employee" }, { key: "company", label: "Company" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "Email" }, { key: "country", label: "Country" }, { key: "status", label: "Status" }];
    } else if (key === "other-names-phone-list" || key === "other-names-contact-list") {
      const phoneOnly = key === "other-names-phone-list";
      title = phoneOnly ? "Other Names Phone List" : "Other Names Contact List";
      const savedNames = new Set(allContacts.map((contact) => contact.name.trim().toLowerCase()));
      const names = new Map<string, { transactions: number; lastActivity: string }>();
      scopedTransactions.filter((row) => row.party.trim() && !savedNames.has(row.party.trim().toLowerCase())).forEach((row) => { const old = names.get(row.party) ?? { transactions: 0, lastActivity: "" }; names.set(row.party, { transactions: old.transactions + 1, lastActivity: row.transactionDate > old.lastActivity ? row.transactionDate : old.lastActivity }); });
      rows = [...names].map(([name, value]) => ({ name, phone: "—", ...value })).sort((a, b) => a.name.localeCompare(b.name));
      columns = phoneOnly ? [{ key: "name", label: "Other Name" }, { key: "phone", label: "Phone" }, { key: "lastActivity", label: "Last Activity" }] : [{ key: "name", label: "Other Name" }, { key: "transactions", label: "Transactions" }, { key: "lastActivity", label: "Last Activity" }];
    } else if (key === "terms-listing") {
      title = "Terms Listing";
      const grouped = new Map<number, { documents: number; names: Set<string> }>();
      scopedTransactions.filter((row) => row.dueDate).forEach((row) => { const days = Math.max(0, Math.round((new Date(row.dueDate).getTime() - new Date(row.transactionDate).getTime()) / 86400000)); const old = grouped.get(days) ?? { documents: 0, names: new Set<string>() }; old.documents += 1; old.names.add(row.party); grouped.set(days, old); });
      rows = [...grouped].sort(([a], [b]) => a - b).map(([days, value]) => ({ terms: days === 0 ? "Due on receipt" : `Net ${days}`, days, documents: value.documents, names: value.names.size }));
      columns = [{ key: "terms", label: "Terms" }, { key: "days", label: "Due Days" }, { key: "documents", label: "Documents" }, { key: "names", label: "Customers / Suppliers" }];
    } else if (key === "to-do-notes") {
      title = "To Do Notes";
      rows = scopedTransactions.filter((row) => row.memo.trim() && !["paid", "cleared", "closed", "cancelled"].includes(row.status)).map((row) => ({ dueDate: row.dueDate || "—", date: row.transactionDate, number: row.number, type: row.type, name: row.party || "—", note: row.memo, status: row.status }));
      columns = [{ key: "dueDate", label: "Due Date" }, { key: "date", label: "Created" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "note", label: "Note" }, { key: "status", label: "Status" }];
    } else if (key === "memorised-transactions") {
      title = "Memorised Transaction Listing";
      rows = scopedTransactions.filter((row) => /memorised|memorized|recurring|template/i.test(row.memo)).map((row) => ({ date: row.transactionDate, number: row.number, type: row.type, name: row.party || "—", account: row.account, memo: row.memo, currency: row.currency, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "account", label: "Account" }, { key: "memo", label: "Template / Frequency" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "daily-sales-summary") {
      title = "Daily Sales Summary";
      const grouped = new Map<string, { documents: Set<string>; quantity: number; sales: number; vat: number; total: number }>();
      lines.filter((line) => ["invoice", "sales receipt"].includes(line.type)).forEach((line) => { const old = grouped.get(line.date) ?? { documents: new Set<string>(), quantity: 0, sales: 0, vat: 0, total: 0 }; old.documents.add(line.number); old.quantity += line.quantity; old.sales += line.subtotal * line.exchangeRate; old.vat += line.vatAmount * line.exchangeRate; old.total += (line.subtotal + line.vatAmount) * line.exchangeRate; grouped.set(line.date, old); });
      rows = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, documents: value.documents.size, quantity: value.quantity, sales: value.sales, vat: value.vat, total: value.total }));
      columns = [{ key: "date", label: "Date" }, { key: "documents", label: "Documents" }, { key: "quantity", label: "Quantity" }, { key: "sales", label: "Sales", ...money }, { key: "vat", label: "VAT", ...money }, { key: "total", label: "Total", ...money }];
    } else if (key === "daily-sales-detail") {
      title = "Daily Sales Detail";
      rows = scopedTransactions.filter((row) => ["invoice", "sales receipt"].includes(row.type)).map((row) => ({ date: row.transactionDate, number: row.number, customer: row.party, type: row.type, salesman: row.salesman || "Unassigned", status: row.status, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "salesman", label: "Sales Rep" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "sales-by-customer-detail") {
      title = "Sales by Customer Detail";
      rows = scopedTransactions.filter((row) => ["invoice", "sales receipt"].includes(row.type)).map((row) => ({ customer: row.party, date: row.transactionDate, number: row.number, type: row.type, salesman: row.salesman || "Unassigned", amount: baseSubtotal(row), vat: row.vatAmount * row.exchangeRate, total: row.baseTotal }));
      columns = [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "salesman", label: "Sales Rep" }, { key: "amount", label: "Sales", ...money }, { key: "vat", label: "VAT", ...money }, { key: "total", label: "Total", ...money }];
    } else if (key === "sales-by-item-detail") {
      title = "Sales by Item Detail";
      rows = lines.filter((line) => ["invoice", "sales receipt"].includes(line.type)).map((line) => ({ date: line.date, number: line.number, customer: line.party, item: line.description, quantity: line.quantity, unitPrice: line.quantity ? line.subtotal * line.exchangeRate / line.quantity : 0, amount: line.subtotal * line.exchangeRate }));
      columns = [{ key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "customer", label: "Customer" }, { key: "item", label: "Item" }, { key: "quantity", label: "Quantity" }, { key: "unitPrice", label: "Unit Price", ...money }, { key: "amount", label: "Sales", ...money }];
    } else if (key === "sales-by-rep-summary" || key === "sales-by-rep-detail") {
      const detail = key === "sales-by-rep-detail";
      title = detail ? "Sales by Rep Detail" : "Sales by Rep Summary";
      const sales = scopedTransactions.filter((row) => ["invoice", "sales receipt"].includes(row.type));
      if (detail) {
        rows = sales.map((row) => ({ salesman: row.salesman || "Unassigned", date: row.transactionDate, number: row.number, customer: row.party, status: row.status, amount: baseSubtotal(row) }));
        columns = [{ key: "salesman", label: "Sales Rep" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "customer", label: "Customer" }, { key: "status", label: "Status" }, { key: "amount", label: "Sales", ...money }];
      } else {
        const grouped = new Map<string, { documents: number; amount: number }>();
        sales.forEach((row) => { const name = row.salesman || "Unassigned"; const old = grouped.get(name) ?? { documents: 0, amount: 0 }; grouped.set(name, { documents: old.documents + 1, amount: old.amount + baseSubtotal(row) }); });
        rows = [...grouped].map(([salesman, value]) => ({ salesman, ...value })).sort((a, b) => b.amount - a.amount);
        columns = [{ key: "salesman", label: "Sales Rep" }, { key: "documents", label: "Documents" }, { key: "amount", label: "Sales", ...money }];
      }
    } else if (key === "sales-by-ship-to") {
      title = "Sales by Ship To Address";
      const addressByCustomer = new Map(allContacts.filter((contact) => contact.type === "customer").map((contact) => [contact.name, contact.country || "Unassigned"]));
      const grouped = new Map<string, { customers: Set<string>; documents: number; amount: number }>();
      scopedTransactions.filter((row) => ["invoice", "sales receipt"].includes(row.type)).forEach((row) => { const address = addressByCustomer.get(row.party) ?? "Unassigned"; const old = grouped.get(address) ?? { customers: new Set<string>(), documents: 0, amount: 0 }; old.customers.add(row.party); old.documents += 1; old.amount += baseSubtotal(row); grouped.set(address, old); });
      rows = [...grouped].map(([address, value]) => ({ address, customers: value.customers.size, documents: value.documents, amount: value.amount })).sort((a, b) => b.amount - a.amount);
      columns = [{ key: "address", label: "Ship To Country / Address" }, { key: "customers", label: "Customers" }, { key: "documents", label: "Documents" }, { key: "amount", label: "Sales", ...money }];
    } else if (key === "sales-graph") {
      title = "Sales Graph";
      const months = new Map<string, { sales: number; refunds: number }>();
      scopedTransactions.filter((row) => ["invoice", "sales receipt", "credit memo"].includes(row.type)).forEach((row) => { const month = row.transactionDate.slice(0, 7); const old = months.get(month) ?? { sales: 0, refunds: 0 }; if (row.type === "credit memo") old.refunds += baseSubtotal(row); else old.sales += baseSubtotal(row); months.set(month, old); });
      rows = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, ...value, netSales: value.sales - value.refunds }));
      columns = [{ key: "month", label: "Month" }, { key: "sales", label: "Sales", ...money }, { key: "refunds", label: "Refunds", ...money }, { key: "netSales", label: "Net Sales", ...money }];
      chart = { labelKey: "month", incomeKey: "sales", expenseKey: "refunds" };
    } else if (key === "pending-sales") {
      title = "Pending Sales";
      rows = scopedTransactions.filter((row) => ["quotation", "estimate", "sales order", "invoice"].includes(row.type) && !["paid", "cleared", "cancelled", "closed", "converted"].includes(row.status)).map((row) => ({ date: row.transactionDate, dueDate: row.dueDate, number: row.number, type: row.type, customer: row.party, salesman: row.salesman || "Unassigned", status: row.status, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "dueDate", label: "Due Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "customer", label: "Customer" }, { key: "salesman", label: "Sales Rep" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "sales-by-customer" || key === "customer-balances") {
      title = key === "sales-by-customer" ? "Sales by Customer Summary" : "Customer Balance Summary";
      if (key === "sales-by-customer") rows = groupTransactions(["invoice", "sales receipt"]);
      else {
        const balances = new Map<string, number>();
        customerActivities.forEach((row) => balances.set(row.party, (balances.get(row.party) ?? 0) + customerImpact(row)));
        rows = [...balances].map(([name, amount]) => ({ name, amount })).sort((a, b) => a.name.localeCompare(b.name));
      }
      columns = [{ key: "name", label: "Customer" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "purchases-by-supplier-detail") {
      title = "Purchases by Supplier Detail";
      rows = scopedTransactions.filter((row) => ["bill", "received item bill", "expense"].includes(row.type)).map((row) => ({ supplier: row.party, date: row.transactionDate, number: row.number, type: row.type, status: row.status, currency: row.currency, subtotal: baseSubtotal(row), vat: row.vatAmount * row.exchangeRate, total: row.baseTotal }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "subtotal", label: "Purchases", ...money }, { key: "vat", label: "VAT", ...money }, { key: "total", label: "Total", ...money }];
    } else if (key === "purchases-by-vendor" || key === "vendor-balances") {
      title = key === "purchases-by-vendor" ? "Purchases by Supplier Summary" : "Supplier Balance Summary";
      if (key === "purchases-by-vendor") rows = groupTransactions(["bill", "received item bill", "expense"]);
      else {
        const grouped = new Map<string, number>();
        supplierActivities.forEach((row) => grouped.set(row.party, (grouped.get(row.party) ?? 0) + supplierImpact(row)));
        rows = [...grouped].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
      }
      columns = [{ key: "name", label: "Supplier" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "supplier-balance-detail") {
      title = "Supplier Balance Detail";
      const balances = new Map<string, number>();
      rows = supplierActivities.filter((row) => !["purchase order", "item receipt"].includes(row.type)).map((row) => { const amount = supplierImpact(row); const balance = (balances.get(row.party) ?? 0) + amount; balances.set(row.party, balance); return { supplier: row.party, date: row.transactionDate, number: row.number, type: row.type, charge: amount > 0 ? amount : 0, payment: amount < 0 ? -amount : 0, balance }; });
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "charge", label: "Bill / Charge", ...money }, { key: "payment", label: "Payment / Credit", ...money }, { key: "balance", label: "Balance", ...money }];
    } else if (key === "unpaid-bills-detail") {
      title = "Unpaid Bills Detail";
      rows = scopedTransactions.filter((row) => ["bill", "received item bill"].includes(row.type) && !["paid", "cleared"].includes(row.status)).map((row) => ({ supplier: row.party, date: row.transactionDate, dueDate: row.dueDate || "—", number: row.number, type: row.type, status: row.status, overdueDays: row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0, currency: row.currency, amount: Math.max(0, row.total - allTransactions.filter((payment) => payment.billId === row.id).reduce((sum, payment) => sum + payment.total, 0)) * row.exchangeRate }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Bill Date" }, { key: "dueDate", label: "Due Date" }, { key: "number", label: "Bill No." }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "overdueDays", label: "Days Overdue" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Open Amount", ...money }];
    } else if (key === "accounts-payable-graph") {
      title = "Accounts Payable Graph";
      const months = new Map<string, { bills: number; payments: number }>();
      supplierActivities.filter((row) => supplierImpact(row) !== 0).forEach((row) => { const month = row.transactionDate.slice(0, 7); const old = months.get(month) ?? { bills: 0, payments: 0 }; if (supplierImpact(row) < 0) old.payments += row.baseTotal; else old.bills += row.baseTotal; months.set(month, old); });
      let balance = 0;
      rows = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => { balance += value.bills - value.payments; return { month, ...value, balance }; });
      columns = [{ key: "month", label: "Month" }, { key: "bills", label: "Bills / Charges", ...money }, { key: "payments", label: "Payments / Credits", ...money }, { key: "balance", label: "A/P Balance", ...money }];
      chart = { labelKey: "month", incomeKey: "bills", expenseKey: "payments" };
    } else if (key === "supplier-transactions") {
      title = "Transaction List by Supplier";
      rows = supplierActivities.map((row) => ({ supplier: row.party, date: row.transactionDate, number: row.number, type: row.type, status: row.status, currency: row.currency, amount: supplierImpact(row) }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Net Amount", ...money }];
    } else if (key === "supplier-phone-list") {
      title = "Supplier Phone List";
      rows = allContacts.filter((row) => row.type === "vendor").map((row) => ({ supplier: row.name, company: row.company || "—", phone: row.phone || "—", whatsapp: row.whatsapp || "—", country: row.country || "—" }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "company", label: "Company" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "country", label: "Country" }];
    } else if (key === "supplier-contact-list") {
      title = "Supplier Contact List";
      rows = allContacts.filter((row) => row.type === "vendor").map((row) => ({ supplier: row.name, company: row.company || "—", email: row.email || "—", phone: row.phone || "—", whatsapp: row.whatsapp || "—", country: row.country || "—", trn: row.trn || "—", currency: row.currency, status: row.status }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "company", label: "Company" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "country", label: "Country" }, { key: "trn", label: "TRN" }, { key: "currency", label: "Currency" }, { key: "status", label: "Status" }];
    } else if (key === "purchases-by-item-detail") {
      title = "Purchases by Item Detail";
      rows = lines.filter((line) => ["bill", "received item bill"].includes(line.type)).map((line) => ({ supplier: line.party, date: line.date, number: line.number, item: line.description, quantity: line.quantity, unitCost: line.quantity ? line.subtotal * line.exchangeRate / line.quantity : 0, vat: line.vatAmount * line.exchangeRate, total: (line.subtotal + line.vatAmount) * line.exchangeRate }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "item", label: "Item" }, { key: "quantity", label: "Quantity" }, { key: "unitCost", label: "Unit Cost", ...money }, { key: "vat", label: "VAT", ...money }, { key: "total", label: "Total", ...money }];
    } else if (["sales-by-item", "purchases-by-item", "item-profitability"].includes(key)) {
      title = key === "sales-by-item" ? "Sales by Item Summary" : key === "purchases-by-item" ? "Purchases by Item Summary" : "Item Profitability";
      rows = groupLines(key === "purchases-by-item" ? ["bill", "received item bill"] : ["invoice", "sales receipt"]);
      columns = [{ key: "name", label: "Item" }, { key: "quantity", label: "Quantity" }, { key: "amount", label: "Sales / Purchases", ...money }, ...(key === "item-profitability" ? [{ key: "profit", label: "Gross Profit", ...money }] : [])];
    } else if (key === "inventory-valuation") {
      title = "Stock Valuation Summary";
      const grouped = new Map<string, { items: number; quantity: number; value: number }>();
      allItems.filter((row) => row.status === "active").forEach((row) => { const category = row.category || "General"; const old = grouped.get(category) ?? { items: 0, quantity: 0, value: 0 }; grouped.set(category, { items: old.items + 1, quantity: old.quantity + row.quantity, value: old.value + row.quantity * row.cost }); });
      rows = [...grouped].map(([category, value]) => ({ category, ...value })).sort((a, b) => b.value - a.value);
      columns = [{ key: "category", label: "Category" }, { key: "items", label: "Items" }, { key: "quantity", label: "On Hand" }, { key: "value", label: "Stock Value", ...money }];
    } else if (key === "inventory-valuation-detail") {
      title = "Stock Valuation Detail";
      rows = allItems.filter((row) => row.status === "active").map((row) => ({ itemNumber: row.itemNumber || "—", sku: row.sku, name: row.name, category: row.category, quantity: row.quantity, cost: row.cost, value: row.quantity * row.cost }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "category", label: "Category" }, { key: "quantity", label: "On Hand" }, { key: "cost", label: "Avg. Cost", ...money }, { key: "value", label: "Stock Value", ...money }];
    } else if (key === "inventory-status") {
      title = "Stock Status by Item";
      rows = allItems.filter((row) => row.status === "active").map((row) => ({ itemNumber: row.itemNumber || "—", sku: row.sku, name: row.name, quantity: row.quantity, reorder: row.reorderPoint, available: Math.max(0, row.quantity), status: row.quantity <= 0 ? "Out of Stock" : row.quantity <= row.reorderPoint ? "Low Stock" : "In Stock", value: row.quantity * row.cost }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "quantity", label: "On Hand" }, { key: "available", label: "Available" }, { key: "reorder", label: "Reorder" }, { key: "status", label: "Status" }, { key: "value", label: "Stock Value", ...money }];
    } else if (key === "inventory-status-supplier") {
      title = "Stock Status by Supplier";
      const latestSupplier = new Map<number, { date: string; supplier: string }>();
      lines.filter((line) => line.itemId && ["bill", "received item bill"].includes(line.type)).forEach((line) => { const itemId = Number(line.itemId); const old = latestSupplier.get(itemId); if (!old || line.date >= old.date) latestSupplier.set(itemId, { date: line.date, supplier: line.party }); });
      const grouped = new Map<string, { items: number; quantity: number; lowStock: number; outOfStock: number; value: number }>();
      allItems.filter((row) => row.status === "active").forEach((row) => { const supplier = latestSupplier.get(row.id)?.supplier ?? "Unassigned"; const old = grouped.get(supplier) ?? { items: 0, quantity: 0, lowStock: 0, outOfStock: 0, value: 0 }; grouped.set(supplier, { items: old.items + 1, quantity: old.quantity + row.quantity, lowStock: old.lowStock + (row.quantity > 0 && row.quantity <= row.reorderPoint ? 1 : 0), outOfStock: old.outOfStock + (row.quantity <= 0 ? 1 : 0), value: old.value + row.quantity * row.cost }); });
      rows = [...grouped].map(([supplier, value]) => ({ supplier, ...value })).sort((a, b) => b.value - a.value);
      columns = [{ key: "supplier", label: "Latest Supplier" }, { key: "items", label: "Items" }, { key: "quantity", label: "On Hand" }, { key: "lowStock", label: "Low Stock" }, { key: "outOfStock", label: "Out of Stock" }, { key: "value", label: "Stock Value", ...money }];
    } else if (key === "physical-inventory") {
      title = "Physical Stock Worksheet";
      rows = allItems.filter((row) => row.status === "active").map((row) => ({ itemNumber: row.itemNumber || "—", sku: row.sku, name: row.name, category: row.category, quantity: row.quantity, count: "", difference: "" }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "category", label: "Category" }, { key: "quantity", label: "System Qty" }, { key: "count", label: "Physical Count" }, { key: "difference", label: "Difference" }];
    } else if (key === "pending-builds") {
      title = "Pending Builds";
      rows = allItems.filter((row) => row.status === "active" && row.quantity < row.reorderPoint).map((row) => ({ itemNumber: row.itemNumber || "—", sku: row.sku, name: row.name, category: row.category, onHand: row.quantity, buildLevel: row.reorderPoint, required: Math.max(0, row.reorderPoint - row.quantity), status: row.quantity <= 0 ? "Required" : "Below Level" }));
      columns = [{ key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item / Assembly" }, { key: "category", label: "Category" }, { key: "onHand", label: "On Hand" }, { key: "buildLevel", label: "Build Level" }, { key: "required", label: "Required Qty" }, { key: "status", label: "Status" }];
    } else if (key === "open-invoices") { title = "Open Invoices"; rows = txRows(["invoice"]).filter((row) => !["paid", "cleared"].includes(String(row.status))); }
    else if (key === "sales-orders") { title = "Sales Order Fulfilment"; rows = txRows(["sales order"]); }
    else if (key === "open-purchase-orders") {
      title = "Open Purchase Orders";
      rows = scopedTransactions.filter((row) => row.type === "purchase order" && !["paid", "closed", "received", "cancelled", "converted"].includes(row.status)).map((row) => ({ date: row.transactionDate, dueDate: row.dueDate || "—", number: row.number, supplier: row.party, status: row.status, currency: row.currency, amount: row.baseTotal }));
      columns = [{ key: "date", label: "Date" }, { key: "dueDate", label: "Expected Date" }, { key: "number", label: "PO No." }, { key: "supplier", label: "Supplier" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "open-purchase-orders-detail") {
      title = "Open Purchase Orders Detail";
      rows = lines.filter((line) => line.type === "purchase order" && !["paid", "closed", "received", "cancelled", "converted"].includes(line.status)).map((line) => ({ supplier: line.party, date: line.date, number: line.number, item: line.description, quantity: line.quantity, unitCost: line.quantity ? line.subtotal * line.exchangeRate / line.quantity : 0, amount: line.subtotal * line.exchangeRate }));
      columns = [{ key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "number", label: "PO No." }, { key: "item", label: "Item" }, { key: "quantity", label: "Open Quantity" }, { key: "unitCost", label: "Unit Cost", ...money }, { key: "amount", label: "Open Amount", ...money }];
    } else if (key === "open-purchase-orders-job") {
      title = "Open Purchase Orders by Job";
      const locationNames = new Map(locations.map((location) => [location.id, location.name]));
      const grouped = new Map<string, { orders: number; suppliers: Set<string>; amount: number }>();
      scopedTransactions.filter((row) => row.type === "purchase order" && !["paid", "closed", "received", "cancelled", "converted"].includes(row.status)).forEach((row) => { const job = locationNames.get(row.locationId ?? 0) ?? "Unassigned"; const old = grouped.get(job) ?? { orders: 0, suppliers: new Set<string>(), amount: 0 }; old.orders += 1; old.suppliers.add(row.party); old.amount += row.baseTotal; grouped.set(job, old); });
      rows = [...grouped].map(([job, value]) => ({ job, orders: value.orders, suppliers: value.suppliers.size, amount: value.amount })).sort((a, b) => b.amount - a.amount);
      columns = [{ key: "job", label: "Job / Inventory" }, { key: "orders", label: "Open Orders" }, { key: "suppliers", label: "Suppliers" }, { key: "amount", label: "Open Amount", ...money }];
    }
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

    return Response.json({ report: { key, title, generatedAt: new Date().toISOString(), currency, columns, rows, chart, summary } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not generate report." }, { status: 500 });
  }
}
