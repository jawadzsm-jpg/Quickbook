import { eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, companies } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json();
    const { companyId, scope, password, confirmation } = payload ?? {};
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !["setup", "all"].includes(scope) || typeof password !== "string" || !password || password.length > 128 || typeof confirmation !== "string") return Response.json({ error: "Select a company and clear option, then enter your password and confirmation." }, { status: 400 });
    if (user.role !== "admin" || !user.companyIds.includes(companyId)) return Response.json({ error: "Only the Administrator assigned to this company can clear it." }, { status: 403 });
    const budget = await consumeRateLimit(`company-clear:${user.id}`, 5, 900);
    if (!budget.allowed) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
    const [account] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
    if (!account?.active || String(account.role) !== "admin" || account.mustChangePassword) return Response.json({ error: "Only an active company Administrator can clear this company." }, { status: 403 });
    if ((account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) || !await verifyPassword(password, account.passwordHash)) return Response.json({ error: "Password verification failed." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      // Serialize this rare destructive operation with writes, including new child rows.
      await db.execute(sql`LOCK TABLE companies, stock_transfers, transactions, transaction_lines, inventory_movements, journal_entries, journal_lines, invoice_payment_allocations, bill_payment_allocations, sales_invoice_allocations, purchase_receipt_allocations, inventory_locations, items, contacts, accounts, record_attachments, memorised_reports, inventory_check_reports, inventory_check_lines, vat_returns, vat_adjustments, vat_codes, exchange_rates, company_settings, idempotency_requests IN SHARE ROW EXCLUSIVE MODE`);
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
      if (confirmation.trim() !== company.name) return Response.json({ error: "Type the company name exactly to confirm this action." }, { status: 400 });
      if (scope === "all") {
        // Cross-company stock-transfer rows are historical records for both companies.
        // They are retained; any clearing-company inventories referenced by them are kept inactive below.
        // Reject invalid cross-company document references rather than changing another company's records.
        const cross = await db.execute(sql`SELECT t.id FROM transactions t JOIN transactions source ON source.id IN (t.sales_source_id,t.purchase_order_id,t.invoice_id,t.bill_id,t.source_transaction_id,t.converted_invoice_id) WHERE t.company_id <> source.company_id AND (t.company_id=${companyId} OR source.company_id=${companyId}) LIMIT 1`);
        if (cross.rows.length) return Response.json({ error: "Cross-company documents must be resolved before clearing." }, { status: 409 });
        await db.execute(sql`DELETE FROM invoice_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM bill_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM sales_invoice_allocations WHERE invoice_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM purchase_receipt_allocations WHERE receipt_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`UPDATE transactions SET sales_source_id=NULL,purchase_order_id=NULL WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM stock_transfers WHERE source_company_id=${companyId} AND destination_company_id=${companyId}`);
        // Preserve exact inventory names/locations needed by transfers to another company, but hide them from normal company use.
        await db.execute(sql`UPDATE inventory_locations SET active=false WHERE company_id=${companyId}`);
        // Fixed allowlist: no client-supplied SQL identifiers. Children cascade with their owners.
        for (const table of ["transactions", "journal_entries", "record_attachments", "memorised_reports", "inventory_check_reports", "vat_returns", "vat_adjustments", "items", "contacts", "accounts", "vat_codes", "exchange_rates", "company_settings", "idempotency_requests"]) {
          await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
        }
        await db.execute(sql`DELETE FROM inventory_locations il
          WHERE il.company_id=${companyId}
            AND NOT EXISTS (
              SELECT 1 FROM stock_transfers st
              WHERE st.source_location_id=il.id OR st.destination_location_id=il.id
            )`);
      }
      const [record] = await db.update(companies).set({ logoData: "", rightLogoData: "", stampData: "", documentDesign: "", addressLine1: "", addressLine2: "", city: "", country: "", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: company.baseCurrency, documentTemplate: "modern", documentColor: "#10b981" }).where(eq(companies.id, companyId)).returning();
      await db.insert(auditLog).values({ companyId, action: "cleared", entityType: "company_setup", entityId: companyId, details: `${scope === "all" ? "Company business data and setup" : "Company setup and logos"} cleared by assigned company Administrator ${user.id} (${user.email}) for ${company.name}; company identity, base currency, user access, audit history and cross-company stock-transfer history retained.` });
      return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch {
    return Response.json({ error: "Could not clear the company. No changes were committed; check linked records and try again." }, { status: 500 });
  }
}
