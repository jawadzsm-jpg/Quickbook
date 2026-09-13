import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, contacts, invoicePaymentAllocations, journalEntries, journalLines, transactions } from "@/db/schema";

export type OpenBalanceData = {
  customer: string; asOf: string; customers: string[]; currencies: string[]; canViewAccounts: boolean;
  totalOpen: number; totalAmount: number;
};

// Allocations are in document currency. Never subtract a home-currency payment
// from a foreign-currency invoice or infer settlement from a status label.
export async function customerOpenBalance(companyId: number, locationId: number, homeCurrency: string, params: URLSearchParams, canViewAccounts: boolean) {
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
  const eligible = documents.filter((row) => row.currency === currency && row.transactionDate <= asOf && !["void", "voided", "cancelled", "canceled", "draft"].includes(row.status));
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
    const account = postedAccounts.get(row.id) ?? arAccounts.find((entry) => entry.id === contact?.ledgerAccountId) ?? arAccounts.find((entry) => entry.currency === row.currency);
    return { customer: row.party, type: row.type, date: row.transactionDate, number: row.number, memo: row.memo, dueDate: row.dueDate, openBalance: round(sign * (row.total - (used.get(row.id) || 0))), amount: round(sign * row.total), transactionId: row.id, account: account?.name || "Unlinked", accountId: account?.id || 0 };
  }).filter((row) => Math.abs(row.openBalance) >= 0.005).sort((a, b) => a.customer.localeCompare(b.customer) || a.date.localeCompare(b.date) || a.transactionId - b.transactionId);
  const money = { type: "money" as const };
  const openBalance: OpenBalanceData = { customer, asOf, customers: names, currencies: [...new Set([homeCurrency, currency, ...documents.map((row) => row.currency), ...customers.map((row) => row.currency)])].sort(), canViewAccounts, totalOpen: round(rows.reduce((sum, row) => sum + row.openBalance, 0)), totalAmount: round(rows.reduce((sum, row) => sum + row.amount, 0)) };
  return Response.json({ report: { key: "customer-open-balance", companyId, title: "Customer Open Balance", generatedAt: new Date().toISOString(), currency, openBalance,
    description: "Open customer documents as of the selected date. Payments and credits are negative; fully allocated documents are excluded. Amounts use the selected document currency. Manual journals are available through account history.",
    columns: [{ key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "date", label: "Date" }, { key: "number", label: "Num" }, { key: "memo", label: "Memo" }, { key: "dueDate", label: "Due Date" }, { key: "openBalance", label: "Open Balance", ...money }, { key: "amount", label: "Amount", ...money }, { key: "account", label: "Receivable Account" }], rows,
  } }, { headers: { "Cache-Control": "private, no-store" } });
}
