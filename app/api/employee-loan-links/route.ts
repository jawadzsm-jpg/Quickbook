import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog, contacts, transactions } from "@/db/schema";
import { apiRoute, RequestError } from "@/lib/api";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";

async function handle(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const input = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json();
  const companyId = Number(input.companyId), employeeId = Number(input.employeeId);
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !isAdministrator(user) || !canAccessCompany(user, companyId)) throw new RequestError("Company administrator access required.", 403);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new RequestError("Select a saved employee.");
  const db = getDb();
  const [employee] = await db.select().from(contacts).where(and(eq(contacts.id, employeeId), eq(contacts.companyId, companyId), eq(contacts.type, "employee"))).for("update");
  if (!employee || employee.status !== "active") throw new RequestError("Select an active employee in this company.");
  // Only already-posted, tax-free bank payments to a genuine employee advance
  // asset are eligible. Linking never re-posts or reclassifies a journal.
  const eligible = and(
    eq(transactions.companyId, companyId), eq(transactions.type, "cheque"),
    eq(transactions.currency, employee.currency), isNull(transactions.employeeLoanContactId),
    isNull(transactions.billId), isNull(transactions.invoiceId),
    eq(transactions.vatAmount, 0), sql`${transactions.total} > 0`,
    sql`${transactions.status} NOT IN ('void', 'voided', 'cancelled', 'canceled', 'draft')`,
    sql`EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = ${companyId} AND a.name = ${transactions.account} AND a.active = true AND a.type = 'Other Current Asset' AND a.system_role IS NULL AND a.currency = ${employee.currency} AND (${employee.loanAccountId}::integer IS NULL OR a.id = ${employee.loanAccountId}))`,
    sql`(SELECT count(*) FROM accounts a WHERE a.company_id = ${companyId} AND a.name = ${transactions.account}) = 1`,
    sql`EXISTS (SELECT 1 FROM journal_entries j JOIN journal_lines l ON l.journal_entry_id = j.id WHERE j.company_id = ${companyId} AND j.transaction_id = ${transactions.id} AND l.account_name = ${transactions.account} AND l.debit > 0)`,
    sql`EXISTS (SELECT 1 FROM journal_entries j JOIN journal_lines l ON l.journal_entry_id = j.id JOIN accounts a ON a.company_id = j.company_id AND a.name = l.account_name WHERE j.company_id = ${companyId} AND j.transaction_id = ${transactions.id} AND (a.type = 'Bank' OR a.system_role = 'BANK') AND l.credit > 0)`,
    sql`NOT EXISTS (SELECT 1 FROM bill_payment_allocations p WHERE p.payment_id = ${transactions.id})`,
    sql`NOT EXISTS (SELECT 1 FROM invoice_payment_allocations p WHERE p.payment_id = ${transactions.id})`,
  );
  if (request.method === "GET") {
    const candidates = await db.select({ id: transactions.id, number: transactions.number, date: transactions.transactionDate, party: transactions.party, currency: transactions.currency, amount: transactions.total, account: transactions.account }).from(transactions).where(eligible).orderBy(desc(transactions.transactionDate), desc(transactions.id));
    return Response.json({ candidates });
  }
  const id = Number(input.transactionId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new RequestError("Choose an existing loan payment.");
  const [payment] = await db.select().from(transactions).where(and(eq(transactions.id, id), eligible)).for("update");
  if (!payment) throw new RequestError("This payment is already linked or is not an eligible bank loan. Refresh the list.", 409);
  // Lock the posting account while validating the link against concurrent edits.
  const [account] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, payment.account))).for("update");
  if (!account || !account.active || account.type !== "Other Current Asset" || account.systemRole || account.currency !== employee.currency) throw new RequestError("The loan account changed. Refresh and try again.", 409);
  await db.update(transactions).set({ employeeLoanContactId: employeeId }).where(eq(transactions.id, id));
  await db.insert(auditLog).values({ companyId, action: "updated", entityType: "transaction", entityId: id, details: JSON.stringify({ actorId: user.id, mode: "employee-loan-link", employeeId, employeeName: employee.name, paymentNumber: payment.number, previousEmployeeId: null }) });
  return Response.json({ payment: { id, number: payment.number, date: payment.transactionDate, currency: payment.currency, amount: payment.total, account: payment.account } });
}

export const GET = apiRoute(handle);
export const PATCH = apiRoute(handle, { transaction: true });
