import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "../../../db";
import { auditLog, companies, vatCodes } from "../../../db/schema";
import { canAccessCompany, requireApiUser, requireCompanyAccess } from "@/lib/auth";
import { standardVatCodes } from "@/lib/standard-vat-codes";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update VAT codes.";
  if (message.includes("idx_vat_codes_company_code")) return "That VAT code already exists for this company.";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replaceAll(" ", "_");
}

function validRate(value: unknown) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

async function getVatCodes(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    await db.insert(vatCodes).values(standardVatCodes.map((vatCode) => ({ companyId, ...vatCode }))).onConflictDoNothing({ target: [vatCodes.companyId, vatCodes.code] });
    const codes = await db.select().from(vatCodes).where(eq(vatCodes.companyId, companyId)).orderBy(asc(vatCodes.code));
    const requestedId = Number(url.searchParams.get("id"));
    if (url.searchParams.has("id")) {
      const code = codes.find((entry) => entry.id === requestedId);
      if (!code) return Response.json({ error: "VAT code not found." }, { status: 404 });
      const [documents, itemUsage, attachments] = await Promise.all([
        db.execute(sql`
          SELECT DISTINCT t.id, t.transaction_date AS "transactionDate", t.number, t.type, t.party, t.currency, t.total
          FROM transaction_lines line
          JOIN transactions t ON t.id=line.transaction_id
          WHERE t.company_id=${companyId} AND line.vat_code=${code.code}
          ORDER BY t.transaction_date DESC, t.id DESC
          LIMIT 100
        `),
        db.execute(sql`
          SELECT id, sku, name, purchase_vat_code AS "purchaseVatCode", sales_vat_code AS "salesVatCode"
          FROM items
          WHERE company_id=${companyId} AND (purchase_vat_code=${code.code} OR sales_vat_code=${code.code})
          ORDER BY name, id
          LIMIT 100
        `),
        db.execute(sql`SELECT id, file_name AS "fileName", mime_type AS "mimeType", file_size AS "fileSize", created_at AS "createdAt" FROM record_attachments WHERE company_id=${companyId} AND entity_type='vat_code' AND entity_id=${code.id} ORDER BY id DESC`),
      ]);
      return Response.json({ code, documents: documents.rows, items: itemUsage.rows, attachments: attachments.rows });
    }
    const [documentUsage, itemUsage, attachmentUsage] = await Promise.all([
      db.execute(sql`SELECT line.vat_code AS code, count(DISTINCT line.transaction_id)::int AS count FROM transaction_lines line JOIN transactions t ON t.id=line.transaction_id WHERE t.company_id=${companyId} GROUP BY line.vat_code`),
      db.execute(sql`
        SELECT code, count(DISTINCT id)::int AS count FROM (
          SELECT id, purchase_vat_code AS code FROM items WHERE company_id=${companyId}
          UNION ALL
          SELECT id, sales_vat_code AS code FROM items WHERE company_id=${companyId}
        ) linked_items GROUP BY code
      `),
      db.execute(sql`SELECT entity_id AS id, count(*)::int AS count FROM record_attachments WHERE company_id=${companyId} AND entity_type='vat_code' GROUP BY entity_id`),
    ]);
    const documentCounts = new Map(documentUsage.rows.map((row) => [String(row.code), Number(row.count)]));
    const itemCounts = new Map(itemUsage.rows.map((row) => [String(row.code), Number(row.count)]));
    const attachmentCounts = new Map(attachmentUsage.rows.map((row) => [Number(row.id), Number(row.count)]));
    return Response.json({ codes: codes.map((code) => ({ ...code, documentCount: documentCounts.get(code.code) ?? 0, itemCount: itemCounts.get(code.code) ?? 0, attachmentCount: attachmentCounts.get(code.id) ?? 0 })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function createVatCode(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const code = cleanCode(payload.code);
    const name = String(payload.name ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const rate = validRate(payload.rate);
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) return Response.json({ error: "VAT code must use 1–20 letters, numbers, hyphens or underscores." }, { status: 400 });
    if (!name || name.length > 80 || description.length > 500 || rate === null) return Response.json({ error: "Enter a name, a VAT rate from 0 to 100, and an optional description up to 500 characters." }, { status: 400 });
    const db = getDb();
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    const [record] = await db.insert(vatCodes).values({ companyId, code, name, rate, description }).returning();
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "vat_code", entityId: record.id, details: `${code} created at ${rate}%` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function updateVatCode(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    const name = String(payload.name ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const rate = validRate(payload.rate);
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (!Number.isInteger(id) || !name || name.length > 80 || description.length > 500 || rate === null) {
      return Response.json({ error: "Enter valid VAT-code details." }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db.select().from(vatCodes).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId))).limit(1);
    if (!existing) return Response.json({ error: "VAT code not found." }, { status: 404 });
    const requestedActive = payload.active === undefined ? existing.active : payload.active === true;
    if (existing.system && !requestedActive) return Response.json({ error: "Standard VAT codes must remain active." }, { status: 400 });
    const [record] = await db.update(vatCodes).set({ name, rate: existing.system ? existing.rate : rate, description, active: requestedActive, updatedAt: new Date().toISOString() }).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId))).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "vat_code", entityId: record.id, details: `${record.code} updated to ${record.rate}% (${record.active ? "active" : "inactive"})` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function deleteVatCode(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid VAT code." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [existing] = await db.select().from(vatCodes).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId))).limit(1);
      if (!existing) return Response.json({ error: "VAT code not found." }, { status: 404 });
      if (existing.system) return Response.json({ error: "Standard VAT codes cannot be deleted. You can edit their name and details." }, { status: 400 });
      const usage = await db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM transaction_lines line JOIN transactions t ON t.id=line.transaction_id WHERE t.company_id=${companyId} AND line.vat_code=${existing.code}) AS documents,
          (SELECT count(*)::int FROM items WHERE company_id=${companyId} AND (purchase_vat_code=${existing.code} OR sales_vat_code=${existing.code})) AS items
      `);
      const documents = Number(usage.rows[0]?.documents ?? 0);
      const linkedItems = Number(usage.rows[0]?.items ?? 0);
      if (documents || linkedItems) return Response.json({ error: `This VAT code is linked to ${documents} document line(s) and ${linkedItems} item(s). Deactivate it instead of deleting it.` }, { status: 409 });
      await db.execute(sql`DELETE FROM record_attachments WHERE company_id=${companyId} AND entity_type='vat_code' AND entity_id=${id}`);
      await db.delete(vatCodes).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId)));
      await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "vat_code", entityId: id, details: `${existing.code} deleted` });
      return Response.json({ success: true });
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  return noStore(await getVatCodes(request));
}

export async function POST(request: Request) {
  return noStore(await createVatCode(request));
}

export async function PATCH(request: Request) {
  return noStore(await updateVatCode(request));
}

export async function DELETE(request: Request) {
  return noStore(await deleteVatCode(request));
}
