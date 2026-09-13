import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, contacts, invoicePaymentAllocations, journalEntries, journalLines, transactions } from "@/db/schema";

export type OpenBalanceData = {
  overdueOnly?: boolean;
  customer: string; asOf: string; customers: string[]; currencies: string[]; canViewAccounts: boolean;
  totalOpen: number; totalAmount: number;
};

// Allocations are in document currency. Never subtract a home-currency payment
// from a foreign-currency invoice or infer settlement from a status label.
export async function customerOpenBalance(companyId: number, locationId: number, homeCurrency: string, params: URLSearchParams, canViewAccounts: boolean) {
  const aging = ["ar-aging-summary", "ar-aging-detail"].includes(params.get("type") || "");
  const activeOnly = params.get("type") === "active-customers";
  const overdueOnly = params.get("type") === "customers-overdue-invoices";
  const currency = (params.get("currency") || homeCurrency).toUpperCase();
  const customer = params.get("customer") || "";
  const asOf = params.get("statementDate") || new Date().toISOString().slice(0, 10);
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) {
    return Response.json({ error: "Select a valid currency and as-of date." }, { status: 400 });
  }
  const db = getDb();
  const [documents, allocations, customers, arAccounts, postings] = await Promise.all([
    db.select().from(transactions).where(and(eq(transactions.companyId, companyId), inArray(transactions.type, ["invoice", "statement charge", "finance charge", "customer payment", "credit memo"]))).orderBy(asc(transactions.transactionDate), asc(transactions.id)),
    db.select({ paymentId: invoicePaymentAllocations.paymentId, invoiceId: invoicePaymentAllocations.invoiceId, amount: invoicePaymentAllocations.amount }).from(invoicePaymentAllocations).innerJoin(transactions, eq(transactions.id, invoicePaymentAllocations.paymentId)).where(eq(transactions.companyId, companyId)),
    db.select().from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer"))).orderBy(asc(contacts.name)),
    db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.type, "Accounts Receivable"))),
    db.select({ transactionId: journalEntries.transactionId, account: journalLines.accountName }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId)).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.posted, true))),
  ]);
  const names = [...new Set([...customers.map((row) => row.name), ...documents.map((row) => row.party)])].sort();
  if (customer && !names.includes(customer)) return Response.json({ error: "Select a customer in this company." }, { status: 400 });
  const eligible = documents.filter((row) => (activeOnly || aging || row.currency === currency) && row.transactionDate <= asOf && !["void", "voided", "cancelled", "canceled", "draft"].includes(row.status));
  const byId = new Map(eligible.map((row) => [row.id, row]));
  const used = new Map<number, number>();
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  for (const allocation of allocations) {
    const payment = byId.get(allocation.paymentId), invoice = byId.get(allocation.invoiceId);
    if (!payment || !invoice || payment.type !== "customer payment" || invoice.type !== "invoice" || payment.party !== invoice.party || payment.currency !== invoice.currency) continue;
    used.set(payment.id, round((used.get(payment.id) || 0) + allocation.amount));
    used.set(invoice.id, round((used.get(invoice.id) || 0) + allocation.amount));
  }
  const accountByName = new Map(arAccounts.map((account) => [account.name, account]));
  const postedAccounts = new Map<number, typeof arAccounts[number]>();
  for (const entry of postings) {
    const account = accountByName.get(entry.account);
    if (entry.transactionId && account) postedAccounts.set(entry.transactionId, account);
  }
  const rows = eligible.filter((row) => (!customer || row.party === customer) && (!locationId || row.locationId === locationId)).map((row) => {
    const sign = ["customer payment", "credit memo"].includes(row.type) ? -1 : 1;
    const contact = customers.find((entry) => entry.name === row.party && entry.currency === row.currency);
    const account = postedAccounts.get(row.id) ?? arAccounts.find((entry) => entry.id === contact?.ledgerAccountId && entry.currency === row.currency && entry.active) ?? arAccounts.find((entry) => entry.currency === row.currency && entry.systemRole === "AR" && entry.active);
    return { customer: row.party, currency: row.currency, homeOpenBalance: round(sign * (row.total - (used.get(row.id) || 0)) * (row.total ? row.baseTotal / row.total : row.exchangeRate)), type: row.type, date: row.transactionDate, number: row.number, memo: row.memo, dueDate: row.dueDate, openBalance: round(sign * (row.total - (used.get(row.id) || 0))), amount: round(sign * row.total), transactionId: row.id, account: account?.name || "Unlinked", accountId: account?.id || 0 };
  }).filter((row) => Math.abs(row.openBalance) >= 0.005 && (!overdueOnly || (row.type === "invoice" && row.openBalance > 0 && Boolean(row.dueDate) && row.dueDate < asOf))).sort((a, b) => a.customer.localeCompare(b.customer) || a.date.localeCompare(b.date) || a.transactionId - b.transactionId);
  const money = { type: "money" as const };
  if (aging) {
    const detail = rows.map((row) => ({ customer: row.customer, date: row.date, dueDate: row.dueDate || "—", number: row.number, type: row.type, age: row.openBalance > 0 && row.dueDate ? Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(row.dueDate)) / 86400000)) : 0, amount: row.homeOpenBalance, transactionId: row.transactionId, account: row.account }));
    const grouped = new Map<string, { name: string; current: number; days30: number; days60: number; days90: number; total: number }>();
    for (const row of detail) {
      const group = grouped.get(row.customer) ?? { name: row.customer, current: 0, days30: 0, days60: 0, days90: 0, total: 0 };
      const bucket = row.age <= 0 ? "current" : row.age <= 30 ? "days30" : row.age <= 60 ? "days60" : "days90";
      group[bucket] = round(group[bucket] + row.amount); group.total = round(group.total + row.amount); grouped.set(row.customer, group);
    }
    const summary = params.get("type") === "ar-aging-summary";
    return Response.json({ report: { key: params.get("type"), companyId, title: summary ? "A/R Aging Summary" : "A/R Aging Detail", generatedAt: new Date().toISOString(), currency: homeCurrency,
      description: "Remaining document balances after allocated payments, converted at each document’s stored rate to home currency. Unused payments and credits appear in Current. Historical exchange differences and manual journals are available in account history.",
      columns: summary ? [{ key: "name", label: "Customer" }, { key: "current", label: "Current", ...money }, { key: "days30", label: "1–30", ...money }, { key: "days60", label: "31–60", ...money }, { key: "days90", label: "61+", ...money }, { key: "total", label: "Total", ...money }] : [{ key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "dueDate", label: "Due Date" }, { key: "number", label: "No." }, { key: "type", label: "Type" }, { key: "age", label: "Days Overdue" }, { key: "amount", label: "Open Amount", ...money }, { key: "account", label: "Receivable Account" }],
      rows: summary ? [...grouped.values()].sort((a, b) => b.total - a.total) : detail,
    } }, { headers: { "Cache-Control": "no-store" } });
  }
  if (activeOnly) {
    const activeRows = customers.filter((contact) => contact.status === "active").flatMap((contact) => {
      // Include new/zero-balance customers and each currency with open activity.
      const activity = rows.filter((row) => row.customer === contact.name);
      const contactCurrencies = [...new Set([contact.currency, ...activity.map((row) => row.currency)])].sort();
      return contactCurrencies.map((code) => {
        const balances = activity.filter((row) => row.currency === code);
        const linked = arAccounts.find((account) => account.id === contact.ledgerAccountId && account.currency === code);
        const account = linked ?? arAccounts.find((account) => account.currency === code && account.systemRole === "AR");
        const overdue = balances.filter((row) => row.type === "invoice" && row.openBalance > 0 && row.dueDate && row.dueDate < asOf);
        return { customerId: contact.id, customer: contact.name, phone: contact.phone, email: contact.email, currency: code, status: contact.status, openBalance: round(balances.reduce((sum, row) => sum + row.openBalance, 0)), overdueInvoices: overdue.length, overdueBalance: round(overdue.reduce((sum, row) => sum + row.openBalance, 0)), account: account?.name || "Unlinked", accountId: account?.id || 0 };
      });
    });
    return Response.json({ report: { key: "active-customers", companyId, title: "Active Customers", generatedAt: new Date().toISOString(), currency: homeCurrency, activeCustomers: { canViewAccounts, asOf, count: customers.filter((contact) => contact.status === "active").length },
      description: "Customers marked active, including customers with no open transactions. Each currency is shown separately. Balances reflect the selected inventory; account history covers the whole company.",
      columns: [{ key: "customer", label: "Customer" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "currency", label: "Currency" }, { key: "openBalance", label: "Open Balance", ...money }, { key: "overdueInvoices", label: "Overdue Invoices" }, { key: "overdueBalance", label: "Overdue Balance", ...money }, { key: "account", label: "Receivable Account" }], rows: activeRows,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const openBalance: OpenBalanceData = { overdueOnly, customer, asOf, customers: names, currencies: [...new Set([homeCurrency, currency, ...documents.map((row) => row.currency), ...customers.map((row) => row.currency)])].sort(), canViewAccounts, totalOpen: round(rows.reduce((sum, row) => sum + row.openBalance, 0)), totalAmount: round(rows.reduce((sum, row) => sum + row.amount, 0)) };
  return Response.json({ report: { key: overdueOnly ? "customers-overdue-invoices" : "customer-open-balance", companyId, title: overdueOnly ? "Customers with Overdue Invoices" : "Customer Open Balance", generatedAt: new Date().toISOString(), currency, openBalance,
    description: overdueOnly ? "Invoices due before the selected date with a remaining unpaid balance after allocated payments. Fully paid invoices, invoices without a due date, and invoices due today or later are excluded. Unapplied credits do not settle individual invoices." : "Open customer documents as of the selected date. Payments and credits are negative; fully allocated documents are excluded. Amounts use the selected document currency. Manual journals are available through account history.",
    columns: [{ key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "date", label: "Date" }, { key: "number", label: "Num" }, { key: "memo", label: "Memo" }, { key: "dueDate", label: "Due Date" }, { key: "openBalance", label: "Open Balance", ...money }, { key: "amount", label: "Amount", ...money }, { key: "account", label: "Receivable Account" }], rows,
  } }, { headers: { "Cache-Control": "private, no-store" } });
}
