import { eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, companies, vatCodes } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { CLEAR_SECTIONS, LEGACY_CLEAR_SECTIONS, clearSectionIds, type ClearCounts, type ClearSection } from "@/lib/company-clear";
import { verifyPassword } from "@/lib/password";
import { consumeRateLimit } from "@/lib/rate-limit";
import { standardVatCodes } from "@/lib/standard-vat-codes";
import { DEFAULT_TYPOGRAPHY } from "@/lib/app-typography";

// Items and inventory locations are never deleted here; "stock" resets quantities to zero while keeping them.
// "contacts" (older clients) means customers, vendors and employees together, and also clears every warranty slip.
const allowedSections = [...clearSectionIds, ...Object.keys(LEGACY_CLEAR_SECTIONS)];
type ClearRequest = { companyId: number; password: string; confirmation: string; sections: ClearSection[] };

class InvalidClearRequest extends Error {}

function parseClearRequest(payload: unknown): ClearRequest {
  if (!payload || typeof payload !== "object") throw new InvalidClearRequest();
  const value = payload as Record<string, unknown>;
  const sections = Array.isArray(value.sections) ? [...new Set(value.sections)] : [];
  if (!Number.isSafeInteger(value.companyId) || Number(value.companyId) <= 0 || !sections.length || sections.some((section) => typeof section !== "string" || !allowedSections.includes(section)) || typeof value.password !== "string" || !value.password || value.password.length > 128 || typeof value.confirmation !== "string") {
    throw new InvalidClearRequest();
  }
  return { companyId: Number(value.companyId), password: value.password, confirmation: value.confirmation, sections: sections as ClearSection[] };
}

const salesTypes = ["invoice", "pending invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "credit memo", "customer payment", "statement charge", "finance charge"];
const purchaseTypes = ["bill", "received item bill", "item receipt", "purchase order", "vendor credit", "bill payment", "vendor payment", "expense"];
const bankingTypes = ["cheque", "cheque order", "deposit", "transfer", "credit card charge"];
const list = (values: string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `);

/** What each option would clear in this company, for the dialog. */
async function clearCounts(companyId: number): Promise<ClearCounts> {
  const [row] = (await getDb().execute(sql`SELECT
    (SELECT count(*) FROM transactions WHERE company_id=${companyId} AND type IN (${list(salesTypes)}))::int AS sales,
    (SELECT count(*) FROM transactions WHERE company_id=${companyId} AND type IN (${list(purchaseTypes)}))::int AS purchases,
    (SELECT count(*) FROM transactions WHERE company_id=${companyId} AND type IN (${list(bankingTypes)}))::int AS banking,
    (SELECT count(*) FROM transactions WHERE company_id=${companyId} AND type NOT IN (${list([...salesTypes, ...purchaseTypes, ...bankingTypes])}))::int AS other_documents,
    (SELECT count(*) FROM journal_entries WHERE company_id=${companyId})::int AS journals,
    (SELECT count(*) FROM items WHERE company_id=${companyId} AND quantity<>0)::int AS items_in_stock,
    (SELECT count(*) FROM warehouse_transfers WHERE company_id=${companyId})::int AS warehouse_moves,
    (SELECT count(*) FROM stock_holds WHERE company_id=${companyId})::int AS holds,
    (SELECT count(*) FROM contacts WHERE company_id=${companyId} AND type='customer')::int AS customers,
    (SELECT count(*) FROM warranty_slips w JOIN contacts c ON c.id=w.customer_id WHERE w.company_id=${companyId} AND c.type='customer')::int AS customer_slips,
    (SELECT count(*) FROM contacts WHERE company_id=${companyId} AND type='vendor')::int AS vendors,
    (SELECT count(*) FROM contacts WHERE company_id=${companyId} AND type='employee')::int AS employees,
    (SELECT count(*) FROM warranty_slips WHERE company_id=${companyId})::int AS warranty,
    (SELECT count(*) FROM item_offers WHERE company_id=${companyId})::int AS offers,
    (SELECT count(*) FROM cargos WHERE company_id=${companyId})::int AS cargo,
    (SELECT count(*) FROM rcm_declarations WHERE company_id=${companyId})::int AS rcm,
    (SELECT count(*) FROM memorised_reports WHERE company_id=${companyId})::int AS memorised,
    (SELECT count(*) FROM inventory_check_reports WHERE company_id=${companyId})::int AS inventory_checks,
    (SELECT count(*) FROM staff_salary_sheets WHERE company_id=${companyId})::int AS salary_sheets,
    (SELECT count(*) FROM income_tax_working_papers WHERE company_id=${companyId})::int AS tax_papers,
    (SELECT count(*) FROM record_attachments WHERE company_id=${companyId})::int AS attachments,
    (SELECT count(*) FROM email_templates WHERE company_id=${companyId})::int AS email_templates,
    (SELECT count(*) FROM document_emails WHERE company_id=${companyId})::int AS sent_emails,
    (SELECT count(*) FROM notifications WHERE company_id=${companyId})::int AS notifications,
    (SELECT count(*) FROM vat_codes WHERE company_id=${companyId})::int AS vat_codes,
    (SELECT count(*) FROM exchange_rates WHERE company_id=${companyId})::int AS exchange_rates`)).rows as Record<string, number>[];
  const n = (key: string) => Number(row?.[key] ?? 0);
  return {
    transactions: [{ label: "Sales", count: n("sales") }, { label: "Purchases", count: n("purchases") }, { label: "Banking", count: n("banking") }, { label: "Other documents", count: n("other_documents") }, { label: "Journal entries", count: n("journals") }],
    stock: [{ label: "Items with stock", count: n("items_in_stock") }, { label: "Warehouse moves", count: n("warehouse_moves") }, { label: "Stock holds", count: n("holds") }],
    customers: [{ label: "Customers", count: n("customers") }, { label: "Their warranty slips", count: n("customer_slips") }],
    vendors: [{ label: "Vendors", count: n("vendors") }],
    employees: [{ label: "Employees", count: n("employees") }],
    warranty: [{ label: "Slips", count: n("warranty") }],
    offers: [{ label: "Offers", count: n("offers") }, { label: "Stock holds", count: n("holds") }],
    cargo: [{ label: "Cargo companies", count: n("cargo") }],
    rcm: [{ label: "Declarations", count: n("rcm") }],
    reports: [{ label: "Memorised reports", count: n("memorised") }, { label: "Inventory checks", count: n("inventory_checks") }, { label: "Salary sheets", count: n("salary_sheets") }, { label: "Tax working papers", count: n("tax_papers") }, { label: "Attachments", count: n("attachments") }],
    email: [{ label: "Templates", count: n("email_templates") }, { label: "Sent emails", count: n("sent_emails") }],
    notifications: [{ label: "Notifications", count: n("notifications") }],
    settings: [{ label: "VAT codes", count: n("vat_codes") }, { label: "Exchange rates", count: n("exchange_rates") }],
  };
}

/** Counts for the Clear company dialog. Same people as clearing: the company's own Administrator, never All-Admin. */
export async function GET(request: Request) {
  const user = await requireApiUser(request, true);
  if (user instanceof Response) return user;
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  if (user.role !== "admin" || !Number.isSafeInteger(companyId) || !user.companyIds.includes(companyId)) return Response.json({ error: "Only the Administrator assigned to this company can clear it." }, { status: 403 });
  try {
    return Response.json({ counts: await clearCounts(companyId), sections: CLEAR_SECTIONS.map((section) => section.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not count the company data." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  // Authorize from server-controlled identity data before inspecting request fields.
  if (user.role !== "admin") return Response.json({ error: "Only the Administrator assigned to this company can clear it." }, { status: 403 });
  const rateLimitKey = `company-clear:${user.id}`;
  const [account] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
  if (!account?.active || String(account.role) !== "admin" || account.mustChangePassword) return Response.json({ error: "Only an active company Administrator can clear this company." }, { status: 403 });
  if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) return Response.json({ error: "Password verification failed." }, { status: 403 });
  const passwordHash = account.passwordHash;
  try {
    const { companyId, password, confirmation, sections } = parseClearRequest(await request.json());
    const assignedCompany = user.companyIds.includes(companyId);
    // Deliberately require the assigned company Admin role. All-Admin must never pass this endpoint.
    if (!assignedCompany) return Response.json({ error: "Only the Administrator assigned to this company can clear it." }, { status: 403 });
    const budget = await consumeRateLimit(rateLimitKey, 5, 900);
    if (!budget.allowed) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
    const passwordVerified = await verifyPassword(password, passwordHash);
    if (!passwordVerified) return Response.json({ error: "Password verification failed." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const selected = new Set<string>(sections);
      const legacyContacts = selected.has("contacts");
      if (legacyContacts) for (const section of LEGACY_CLEAR_SECTIONS.contacts) selected.add(section);
      // Stock movements belong to transactions, so stock can only be reset to zero together with the transaction history.
      if (selected.has("stock") && !selected.has("transactions")) return Response.json({ error: "Select Transactions as well to reset stock while keeping items." }, { status: 400 });
      // Serialize this rare destructive operation with writes, including new child rows.
      await db.execute(sql`LOCK TABLE companies, stock_transfers, transactions, transaction_lines, inventory_movements, journal_entries, journal_lines, invoice_payment_allocations, bill_payment_allocations, sales_invoice_allocations, purchase_receipt_allocations, inventory_locations, items, contacts, accounts, record_attachments, memorised_reports, income_tax_working_papers, inventory_check_reports, inventory_check_lines, vat_returns, vat_adjustments, vat_codes, exchange_rates, company_settings, idempotency_requests, warehouse_stock, warehouse_transfers, stock_holds, item_offers, warranty_slips, cargos, rcm_declarations, email_templates, document_emails, notifications, staff_salary_sheets IN SHARE ROW EXCLUSIVE MODE`);
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
        // Packing-list lines use an immediate RESTRICT link to invoice lines. Remove the
        // company packing lists first so invoice transactions can be deleted safely.
        await db.execute(sql`DELETE FROM packing_lists WHERE company_id=${companyId}`);
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
        // Permanent protection: never delete or rebuild the Chart of Accounts. Keep every
        // original main account and sub-account, resetting only transaction-derived balances.
        await db.execute(sql`UPDATE accounts SET balance=0 WHERE company_id=${companyId}`);
        await db.execute(sql`UPDATE contacts SET balance=0 WHERE company_id=${companyId}`);
      }

      if (selected.has("stock")) {
        // Keep every item (names, SKUs, prices, specifications, HS codes) and its inventory location; only on-hand stock
        // starts again from zero. Movements were removed with the transactions above.
        await db.execute(sql`UPDATE items SET quantity=0 WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM warehouse_stock WHERE company_id=${companyId}`);
        // Moves between warehouses and holds describe stock that no longer exists.
        await db.execute(sql`DELETE FROM warehouse_transfers WHERE company_id=${companyId}`);
        await db.execute(sql`DELETE FROM stock_holds WHERE company_id=${companyId}`);
      }

      // Warranty/RMA slips: all of them on request (or with the older "contacts" option); a slip's customer link is
      // required, so clearing customers removes their slips first.
      if (selected.has("warranty") || legacyContacts) await db.execute(sql`DELETE FROM warranty_slips WHERE company_id=${companyId}`);
      if (selected.has("customers")) {
        await db.execute(sql`DELETE FROM warranty_slips WHERE company_id=${companyId} AND customer_id IN (SELECT id FROM contacts WHERE company_id=${companyId} AND type='customer')`);
        await db.execute(sql`DELETE FROM contacts WHERE company_id=${companyId} AND type='customer'`);
      }
      if (selected.has("vendors")) await db.execute(sql`DELETE FROM contacts WHERE company_id=${companyId} AND type='vendor'`);
      if (selected.has("employees")) {
        await db.execute(sql`DELETE FROM record_attachments WHERE company_id=${companyId} AND entity_type='employee'`);
        await db.execute(sql`DELETE FROM contacts WHERE company_id=${companyId} AND type='employee'`);
      }
      if (selected.has("offers")) for (const table of ["item_offers", "stock_holds"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
      if (selected.has("cargo")) await db.execute(sql`DELETE FROM cargos WHERE company_id=${companyId}`);
      if (selected.has("rcm")) await db.execute(sql`DELETE FROM rcm_declarations WHERE company_id=${companyId}`);
      if (selected.has("email")) for (const table of ["document_emails", "email_templates"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
      if (selected.has("notifications")) await db.execute(sql`DELETE FROM notifications WHERE company_id=${companyId}`);
      if (selected.has("reports")) {
        for (const table of ["record_attachments", "memorised_reports", "inventory_check_reports", "staff_salary_sheets", "income_tax_working_papers"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
      }
      if (selected.has("settings")) {
        for (const table of ["vat_codes", "exchange_rates", "company_settings"]) await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE company_id=${companyId}`);
        await db.insert(vatCodes).values(standardVatCodes.map((vatCode) => ({ companyId, ...vatCode })));
      }

      let record = company;
      if (selected.has("setup")) {
        [record] = await db.update(companies).set({ logoData: "", rightLogoData: "", loginLogoData: "", loginLogoOffset: 0, loginTopLogoData: "", loginTopLogoHidden: false, loginLogosSwapped: false, ...DEFAULT_TYPOGRAPHY, loginCompanyLogoData: "", loginDisplayName: "", loginCopyrightYears: "1996-2021", loginBackgroundData: "", loginBackgroundColor: "#f3f6fa", stampData: "", documentDesign: "", letterheadDesign: "", addressLine1: "", addressLine2: "", city: "", country: "", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankAccounts: "", bankStampData: "", bankRemark: "", stampPositions: "", bankCurrency: company.baseCurrency, documentTemplate: "modern", documentColor: "#10b981" }).where(eq(companies.id, companyId)).returning();
      }
      await db.insert(auditLog).values({ companyId, action: "cleared", entityType: "company_setup", entityId: companyId, details: `Selected company data (${[...selected].join(", ")}) cleared${selected.has("stock") ? " (stock reset to zero)" : ""} by assigned company Administrator ${user.id} (${user.email}) for ${company.name}; original Chart of Accounts and all sub-accounts retained with transaction-derived balances reset to zero; items and inventory locations retained. Company identity, base currency, user access, audit history and cross-company stock-transfer history retained.` });
      return Response.json({ record, cleared: sections }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    if (error instanceof InvalidClearRequest) return Response.json({ error: "Select a company and at least one clear option, then enter your password and confirmation." }, { status: 400 });
    console.error(JSON.stringify({ event: "company_clear_failed", assignedCompanyIds: user.companyIds, userId: user.id, code: error && typeof error === "object" && "code" in error ? String(error.code) : "unknown" }));
    return Response.json({ error: "Your password was verified, but linked company records prevented clearing. No changes were made." }, { status: 500 });
  }
}
