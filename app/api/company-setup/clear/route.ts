import { eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, companies } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { consumeRateLimit } from "@/lib/rate-limit";

const allowedSections = ["transactions", "inventory", "contacts", "reports", "settings", "setup"] as const;
type ClearSection = typeof allowedSections[number];

export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json();
    const { companyId, password, confirmation } = payload ?? {};
    const sections = Array.isArray(payload?.sections) ? [...new Set(payload.sections)] : [];
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !sections.length || sections.some((section) => typeof section !== "string" || !allowedSections.includes(section as ClearSection)) || typeof password !== "string" || !password || password.length > 128 || typeof confirmation !== "string") {
      return Response.json({ error: "Select a company and at least one clear option, then enter your password and confirmation." }, { status: 400 });
    }
    // Deliberately require the assigned company Admin role. All-Admin must never pass this endpoint.
    if (user.role !== "admin" || !user.companyIds.includes(companyId)) return Response.json({ error: "Only the Administrator assigned to this company can clear it." }, { status: 403 });
    const budget = await consumeRateLimit(`company-clear:${user.id}`, 5, 900);
    if (!budget.allowed) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
    const [account] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
    if (!account?.active || String(account.role) !== "admin" || account.mustChangePassword) return Response.json({ error: "Only an active company Administrator can clear this company." }, { status: 403 });
    if ((account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) || !await verifyPassword(password, account.passwordHash)) return Response.json({ error: "Password verification failed." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const selected = new Set(sections as ClearSection[]);
      // Serialize this rare destructive operation with writes, including new child rows.
      await db.execute(sql`LOCK TABLE companies, stock_transfers, transactions, transaction_lines, inventory_movements, journal_entries, journal_lines, invoice_payment_allocations, bill_payment_allocations, sales_invoice_allocations, purchase_receipt_allocations, inventory_locations, items, contacts, accounts, record_attachments, memorised_reports, inventory_check_reports, inventory_check_lines, vat_returns, vat_adjustments, vat_codes, exchange_rates, company_settings, idempotency_requests IN SHARE ROW EXCLUSIVE MODE`);
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
      if (confirmation.trim() !== company.name) return Response.json({ error: "The company confirmation does not match." }, { status: 400 });

      if (selected.has("transactions")) {
        // Never alter another company's document history to make this clear operation succeed.
        const crossDocuments = await db.execute(sql`SELECT t.id FROM transactions t JOIN transactions source ON source.id IN (t.sales_source_id,t.purchase_order_id,t.invoice_id,t.bill_id,t.source_transaction_id,t.converted_invoice_id) WHERE t.company_id <> source.company_id AND (t.company_id=${companyId} OR source.company_id=${companyId}) LIMIT 1`);
        const crossPayments = await db.execute(sql`
          SELECT a.id FROM invoice_payment_allocations a
          JOIN transactions payment ON payment.id=a.payment_id
          JOIN transactions document ON document.id=a.invoice_id
          WHERE payment.company_id <> document.company_id AND (payment.company_id=${companyId} OR document.company_id=${companyId})
          UNION ALL
          SELECT a.id FROM bill_payment_allocations a
          JOIN transactions payment ON payment.id=a.payment_id
          JOIN transactions document ON document.id=a.bill_id
          WHERE payment.company_id <> document.company_id AND (payment.company_id=${companyId} OR document.company_id=${companyId})
          LIMIT 1
        `);
        if (crossDocuments.rows.length || crossPayments.rows.length) return Response.json({ error: "Cross-company documents or payments must be resolved before clearing transaction history." }, { status: 409 });
        await db.execute(sql`DELETE FROM invoice_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId}) OR invoice_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM bill_payment_allocations WHERE payment_id IN (SELECT id FROM transactions WHERE company_id=${companyId}) OR bill_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM sales_invoice_allocations WHERE invoice_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`DELETE FROM purchase_receipt_allocations WHERE receipt_id IN (SELECT id FROM transactions WHERE company_id=${companyId})`);
        await db.execute(sql`UPDATE transactions SET sales_source_id=NULL,purchase_order_id=NULL WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM stock_transfers WHERE source_company_id=${companyId} AND destination_company_id=${companyId}`);
        await db.execute(sql`DELETE FROM record_attachments WHERE company_id=${companyId} AND entity_type='transaction'`);
        for (const table of ["transactions", "journal_entries", "vat_returns", "vat_adjustments", "idempotency_requests"]) {
          await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
        }
        // Keep the full Chart of Accounts, but remove balances that belonged to deleted history.
        await db.execute(sql`UPDATE accounts SET balance=0 WHERE company_id=${companyId}`);
        await db.execute(sql`UPDATE contacts SET balance=0 WHERE company_id=${companyId}`);
      }

      if (selected.has("inventory")) {
        await db.execute(sql`DELETE FROM inventory_check_reports WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM items WHERE company_id=${companyId}`);
        // Cross-company transfer locations are historical records for both companies, so keep them inactive.
        await db.execute(sql`UPDATE inventory_locations SET active=false WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM inventory_locations il
          WHERE il.company_id=${companyId}
            AND NOT EXISTS (
              SELECT 1 FROM stock_transfers st
              WHERE st.source_location_id=il.id OR st.destination_location_id=il.id
            )`);
      }

      if (selected.has("contacts")) {
        await db.execute(sql`DELETE FROM record_attachments WHERE company_id=${companyId} AND entity_type='employee'`);
        await db.execute(sql`DELETE FROM contacts WHERE company_id=${companyId}`);
      }
      if (selected.has("reports")) {
        for (const table of ["record_attachments", "memorised_reports", "inventory_check_reports"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
      }
      if (selected.has("settings")) {
        for (const table of ["vat_codes", "exchange_rates", "company_settings"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
      }

      let record = company;
      if (selected.has("setup")) {
        [record] = await db.update(companies).set({ logoData: "", rightLogoData: "", stampData: "", documentDesign: "", addressLine1: "", addressLine2: "", city: "", country: "", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: company.baseCurrency, documentTemplate: "modern", documentColor: "#10b981" }).where(eq(companies.id, companyId)).returning();
      }
      await db.insert(auditLog).values({ companyId, action: "cleared", entityType: "company_setup", entityId: companyId, details: `Selected company data (${sections.join(", ")}) cleared by assigned company Administrator ${user.id} (${user.email}) for ${company.name}; Chart of Accounts, company identity, base currency, user access, audit history and cross-company stock-transfer history retained.` });
      return Response.json({ record, cleared: sections }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch {
    return Response.json({ error: "Could not clear the company. No changes were committed; check linked records and try again." }, { status: 500 });
  }
}
