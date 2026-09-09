import { and, asc, eq, sum } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, contacts, exchangeRates, inventoryLocations, items, journalEntries, journalLines, transactionLines, transactions, vatCodes } from "../../../db/schema";
import { hasPermission, requireApiUser } from "@/lib/auth";

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
    const currency = String(url.searchParams.get("currency") ?? "AED");
    const periodStart = String(url.searchParams.get("periodStart") ?? "");
    const periodEnd = String(url.searchParams.get("periodEnd") ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const journalFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
    const [allTransactions, allContacts, allItems, allAccounts, ledger, journal, lines, configuredVatCodes, currentRates, locations] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.companyId, companyId)).orderBy(asc(transactions.transactionDate)),
      db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)),
      db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name)),
      db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code)),
      db.select({ name: journalLines.accountName, debit: sum(journalLines.debit), credit: sum(journalLines.credit) }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).groupBy(journalLines.accountName).orderBy(asc(journalLines.accountName)),
      db.select({ date: journalEntries.entryDate, reference: journalEntries.reference, description: journalEntries.description, account: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).orderBy(asc(journalEntries.entryDate), asc(journalLines.id)),
      db.select({ itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, unitCost: transactionLines.unitCost, vatCode: transactionLines.vatCode, vatRate: transactionLines.vatRate, vatAmount: transactionLines.vatAmount, type: transactions.type, party: transactions.party, date: transactions.transactionDate, number: transactions.number, transactionCurrency: transactions.currency, exchangeRate: transactions.exchangeRate, isImport: transactions.isImport }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId))),
      db.select().from(vatCodes).where(eq(vatCodes.companyId, companyId)).orderBy(asc(vatCodes.code)),
      db.select().from(exchangeRates).where(and(eq(exchangeRates.companyId, companyId), eq(exchangeRates.active, true))),
      db.select().from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)),
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
    const aged = (types: string[]) => allTransactions.filter((row) => types.includes(row.type) && !["paid", "cleared"].includes(row.status)).map((row) => {
      const age = row.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000)) : 0;
      return { name: row.party, current: age <= 0 ? row.baseTotal : 0, days30: age > 0 && age <= 30 ? row.baseTotal : 0, days60: age > 30 && age <= 60 ? row.baseTotal : 0, days90: age > 60 ? row.baseTotal : 0, total: row.baseTotal };
    });
    const agingColumns = [{ key: "name", label: "Name" }, { key: "current", label: "Current", ...money }, { key: "days30", label: "1–30", ...money }, { key: "days60", label: "31–60", ...money }, { key: "days90", label: "61+", ...money }, { key: "total", label: "Total", ...money }];
    const vatDocumentTypes = new Set(["invoice", "sales receipt", "statement charge", "credit memo", "bill", "received item bill", "expense", "vendor credit"]);
    const vatLines = lines.filter((line) => vatDocumentTypes.has(line.type) && (!periodStart || line.date >= periodStart) && (!periodEnd || line.date <= periodEnd));
    const outputVat = vatLines.reduce((sum, line) => sum + (line.type === "credit memo" ? -1 : ["invoice", "sales receipt", "statement charge"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    const inputVat = vatLines.reduce((sum, line) => sum + (line.type === "vendor credit" ? -1 : ["bill", "received item bill", "expense"].includes(line.type) ? 1 : 0) * line.vatAmount * line.exchangeRate, 0);
    let title = "Transaction List by Date";
    let columns: Array<{ key: string; label: string; type?: "money" }> = txColumns;
    let rows: Row[] = txRows();
    let chart: { labelKey: string; incomeKey: string; expenseKey: string } | undefined;

    if (key === "profit-loss") {
      title = "Profit & Loss Standard";
      rows = ledgerRows.filter((row) => incomeTypes.has(row.type) || expenseTypes.has(row.type)).map((row) => ({ name: row.name, type: row.type, amount: incomeTypes.has(row.type) ? -row.balance : row.balance }));
      const income = rows.filter((row) => incomeTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      const expenses = rows.filter((row) => expenseTypes.has(String(row.type))).reduce((n, row) => n + Number(row.amount), 0);
      rows.push({ name: "Net income", amount: income - expenses });
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
    } else if (key.startsWith("ar-aging")) {
      title = key.endsWith("detail") ? "A/R Aging Detail" : "A/R Aging Summary"; rows = aged(["invoice", "statement charge", "finance charge"]); columns = agingColumns;
    } else if (key.startsWith("ap-aging")) {
      title = key.endsWith("detail") ? "A/P Aging Detail" : "A/P Aging Summary"; rows = aged(["bill", "received item bill"]); columns = agingColumns;
    } else if (key === "customer-statements") {
      title = "Customer Statements";
      const balances = new Map<string, number>();
      rows = allTransactions.filter((row) => (!Number.isInteger(locationId) || locationId <= 0 || row.locationId === locationId) && ["invoice", "statement charge", "finance charge", "customer payment", "credit memo"].includes(row.type)).map((row) => {
        const debit = ["invoice", "statement charge", "finance charge"].includes(row.type) ? row.baseTotal : 0;
        const credit = ["customer payment", "credit memo"].includes(row.type) ? row.baseTotal : 0;
        const balance = (balances.get(row.party) ?? 0) + debit - credit;
        balances.set(row.party, balance);
        return { customer: row.party, date: row.transactionDate, number: row.number, type: row.type, debit, credit, balance };
      });
      columns = [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "number", label: "No." }, { key: "type", label: "Activity" }, { key: "debit", label: "Charge", ...money }, { key: "credit", label: "Payment / Credit", ...money }, { key: "balance", label: "Balance", ...money }];
    } else if (key === "sales-by-customer" || key === "customer-balances") {
      title = key === "sales-by-customer" ? "Sales by Customer" : "Customer Balance Summary";
      rows = key === "sales-by-customer" ? groupTransactions(["invoice", "sales receipt"]) : allContacts.filter((row) => row.type === "customer").map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Customer" }, { key: "amount", label: "Amount", ...money }];
    } else if (key === "purchases-by-vendor" || key === "vendor-balances") {
      title = key === "purchases-by-vendor" ? "Purchases by Vendor" : "Vendor Balance Summary";
      rows = key === "purchases-by-vendor" ? groupTransactions(["bill", "received item bill", "expense"]) : allContacts.filter((row) => row.type === "vendor").map((row) => ({ name: row.name, amount: row.balance }));
      columns = [{ key: "name", label: "Vendor" }, { key: "amount", label: "Amount", ...money }];
    } else if (["sales-by-item", "purchases-by-item", "item-profitability"].includes(key)) {
      title = key === "sales-by-item" ? "Sales by Item" : key === "purchases-by-item" ? "Purchases by Item" : "Item Profitability";
      rows = groupLines(key === "purchases-by-item" ? ["bill", "received item bill"] : ["invoice", "sales receipt"]);
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

    return Response.json({ report: { key, title, generatedAt: new Date().toISOString(), currency, columns, rows, chart } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not generate report." }, { status: 500 });
  }
}
