import { eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, companies } from "@/db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json();
    const { companyId, scope, password, confirmation } = payload ?? {};
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !["setup", "all"].includes(scope) || typeof password !== "string" || !password || password.length > 128 || typeof confirmation !== "string") return Response.json({ error: "Select a company and clear option, then enter your password and confirmation." }, { status: 400 });
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have administrator access to this company." }, { status: 403 });
    const budget = await consumeRateLimit(`company-clear:${user.id}`, 5, 900);
    if (!budget.allowed) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
    const [account] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
    if (!account?.active || !["all_admin", "admin"].includes(String(account.role)) || account.mustChangePassword) return Response.json({ error: "Active Administrator access required." }, { status: 403 });
    if ((account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) || !await verifyPassword(password, account.passwordHash)) return Response.json({ error: "Password verification failed." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      // Serialize this rare destructive operation with writes, including new child rows.
      await db.execute(sql`LOCK TABLE companies, stock_transfers, transactions, transaction_lines, inventory_movements, journal_entries, journal_lines, invoice_payment_allocations, bill_payment_allocations, sales_invoice_allocations, purchase_receipt_allocations, inventory_locations, items, contacts, accounts, record_attachments, memorised_reports, inventory_check_reports, inventory_check_lines, vat_returns, vat_adjustments, vat_codes, exchange_rates, company_settings, idempotency_requests IN SHARE ROW EXCLUSIVE MODE`);
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
      if (confirmation !== `CLEAR ${scope === "all" ? "ALL" : "SETUP"} ${company.name}`) return Response.json({ error: "The confirmation text does not match this company." }, { status: 400 });
      if (scope === "all") {
        const linked = await db.execute(sql`SELECT id FROM stock_transfers WHERE (source_company_id = ${companyId} OR destination_company_id = ${companyId}) AND source_company_id <> destination_company_id LIMIT 1`);
        if (linked.rows.length) return Response.json({ error: "This company has transfers linked to another company. Resolve those transfers before clearing all data." }, { status: 409 });
        // Reject invalid cross-company references rather than changing another company's records.
        const cross = await db.execute(sql`SELECT t.id FROM transactions t JOIN transactions source ON source.id IN (t.sales_source_id,t.purchase_order_id,t.invoice_id,t.bill_id,t.source_transaction_id,t.converted_invoice_id) WHERE t.company_id <> source.company_id AND (t.company_id=${companyId} OR source.company_id=${companyId}) LIMIT 1`);
        if (cross.rows.length) return Response.json({ error: "Cross-company documents must be resolved before clearing." }, { status: 409 });
        await db.execute(sql`DELETE FROM invoice_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM bill_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM sales_invoice_allocations WHERE invoice_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM purchase_receipt_allocations WHERE receipt_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`UPDATE transactions SET sales_source_id=NULL,purchase_order_id=NULL WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM stock_transfers WHERE source_company_id=${companyId} AND destination_company_id=${companyId}`);
        // Fixed allowlist: no client-supplied SQL identifiers. Children cascade with their owners.
        for (const table of ["transactions", "journal_entries", "record_attachments", "memorised_reports", "inventory_check_reports", "vat_returns", "vat_adjustments", "items", "contacts", "accounts", "inventory_locations", "vat_codes", "exchange_rates", "company_settings", "idempotency_requests"]) {
          await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
        }
      }
      const [record] = await db.update(companies).set({ logoData: "", rightLogoData: "", stampData: "", documentDesign: "", addressLine1: "", addressLine2: "", city: "", country: "", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: company.baseCurrency, documentTemplate: "modern", documentColor: "#10b981" }).where(eq(companies.id, companyId)).returning();
      await db.insert(auditLog).values({ companyId, action: "cleared", entityType: "company_setup", entityId: companyId, details: `${scope === "all" ? "Company business data and setup" : "Company setup and logos"} cleared by Administrator ${user.id} (${user.email}); company identity, base currency, user access and audit history retained.` });
      return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch {
    return Response.json({ error: "Could not clear the company. No changes were committed; check linked records and try again." }, { status: 500 });
  }
}
