import { and, eq } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { documentVisibility } from "@/lib/document-access-sql";
import { canEditInventoryDocument, canReadDocument } from "@/lib/document-access";
import { sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { hasPermission, isAdministrator, requireCompanyAccess } from "@/lib/auth";
import { MAX_FILES, parseAttachment } from "@/lib/attachments";

type AttachmentInput = { fileName?: string; mimeType?: string; fileData?: string; fileSize?: number };

const allowedTypes = new Set(["transaction", "employee", "vat_code", "report", "rcm_declaration", "staff_salary_sheet"]);
// Who may add or remove attachments on a saved document: the permission that writes that kind of document.
const salesAttachmentTypes = new Set(["invoice", "pending invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "credit memo", "statement charge", "finance charge", "customer payment"]);
const purchaseAttachmentTypes = new Set(["bill", "received item bill", "item receipt", "purchase order", "vendor credit", "bill payment", "vendor payment", "expense"]);
const bankingAttachmentTypes = new Set(["cheque", "cheque order", "deposit", "transfer", "credit card charge"]);
function canAttachToTransaction(user: Parameters<typeof hasPermission>[0], type: string) {
  if (salesAttachmentTypes.has(type)) return hasPermission(user, "sales:write");
  if (purchaseAttachmentTypes.has(type)) return hasPermission(user, "purchases:write");
  if (bankingAttachmentTypes.has(type)) return hasPermission(user, "banking:write");
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const entityId = Number(url.searchParams.get("entityId"));
  const entityType = String(url.searchParams.get("entityType") ?? "");
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read");
  if (authorization instanceof Response) return authorization;
  if (authorization.role === "sales") {
    if (entityType !== "transaction") return Response.json({ error: "Sales document attachments only." }, { status: 403 });
    const [visible] = await getDb().select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, entityId), eq(transactions.companyId, companyId), documentVisibility(authorization)));
    if (!visible) return Response.json({ error: "Document unavailable. Ask your accountant for saved proformas." }, { status: 403 });
  }
  if (entityType === "transaction" && authorization.role === "inventory") {
    const result = await getDb().execute(sql`SELECT type, created_at AS "createdAt" FROM transactions WHERE id = ${entityId} AND company_id = ${companyId}`);
    const document = result.rows[0];
    if (!document || !canReadDocument(authorization, { type: String(document.type), createdAt: String(document.createdAt) })) return Response.json({ error: "You cannot open this document." }, { status: 403 });
  }
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
  if (entityType === "staff_salary_sheet") {
    if (!isAdministrator(authorization)) return Response.json({ error: "Company administrator access required." }, { status: 403 });
    const sheet = await getDb().execute(sql`SELECT id FROM staff_salary_sheets WHERE id = ${entityId} AND company_id = ${companyId}`);
    if (!sheet.rows.length) return Response.json({ error: "Salary sheet not found." }, { status: 404 });
  }
  const attachmentId = Number(url.searchParams.get("attachmentId"));
  if (url.searchParams.has("attachmentId")) {
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) return Response.json({ error: "Select a valid attachment." }, { status: 400 });
    const file = await getDb().execute(sql`SELECT file_name, mime_type, file_data FROM record_attachments WHERE id = ${attachmentId} AND company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId} LIMIT 1`);
    if (!file.rows.length) return Response.json({ error: "Attachment not found." }, { status: 404 });
    const entry = file.rows[0];
    const encoded = String(entry.file_data).split(",", 2)[1];
    const filename = String(entry.file_name).replace(/[\r\n"\\]/g, "_");
    return new Response(Buffer.from(encoded, "base64"), { headers: {
      "Content-Type": String(entry.mime_type),
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(String(entry.file_name))}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    } });
  }
  const result = await getDb().execute(sql`
    SELECT id, file_name, mime_type, file_size, created_at
    FROM record_attachments
    WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}
    ORDER BY id DESC
  `);
  return Response.json({ attachments: result.rows });
}

export async function POST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const entityId = Number(payload.entityId);
  const entityType = String(payload.entityType ?? "");
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read", true);
  if (authorization instanceof Response) return authorization;
  if (authorization.role === "sales") {
    if (entityType !== "transaction") return Response.json({ error: "Sales document attachments only." }, { status: 403 });
    const [visible] = await getDb().select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, entityId), eq(transactions.companyId, companyId), documentVisibility(authorization)));
    if (!visible) return Response.json({ error: "Document unavailable. Ask your accountant for saved proformas." }, { status: 403 });
  }
  if (entityType === "transaction" && authorization.role === "inventory") {
    const result = await getDb().execute(sql`SELECT type, created_at AS "createdAt" FROM transactions WHERE id = ${entityId} AND company_id = ${companyId}`);
    const document = result.rows[0];
    if (!document || !canEditInventoryDocument(authorization, { type: String(document.type), createdAt: String(document.createdAt) })) return Response.json({ error: "Attachments can be added to bills only on the day they were created." }, { status: 403 });
  }
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
  const files = Array.isArray(payload.attachments) ? payload.attachments as AttachmentInput[] : [];
  if (!files.length) return Response.json({ error: "Choose at least one attachment." }, { status: 400 });
  if (files.length > MAX_FILES || files.some((file) => !parseAttachment(file))) return Response.json({ error: "Choose up to 10 supported files, 3 MB each." }, { status: 400 });
  if (entityType === "staff_salary_sheet") {
    if (!isAdministrator(authorization)) return Response.json({ error: "Company administrator access required." }, { status: 403 });
    return withWriteTransaction(async () => {
      const db = getDb();
      // Serialize uploads against one another and against sheet deletion.
      const sheet = await db.execute(sql`SELECT id FROM staff_salary_sheets WHERE id = ${entityId} AND company_id = ${companyId} FOR UPDATE`);
      if (!sheet.rows.length) return Response.json({ error: "Salary sheet not found." }, { status: 404 });
      const count = await db.execute(sql`SELECT count(*)::int AS total FROM record_attachments WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}`);
      if (Number(count.rows[0]?.total ?? 0) + files.length > MAX_FILES) return Response.json({ error: "A record can have at most 10 attachments." }, { status: 409 });
      const values = files.map((file) => sql`(${companyId}, ${entityType}, ${entityId}, ${String(file.fileName)}, ${String(file.mimeType)}, ${String(file.fileData)}, ${Number(file.fileSize)})`);
      await db.execute(sql`INSERT INTO record_attachments (company_id, entity_type, entity_id, file_name, mime_type, file_data, file_size) VALUES ${sql.join(values, sql`, `)}`);
      return Response.json({ success: true }, { status: 201 });
    });
  }
  const db = getDb();
  const target = entityType === "transaction"
    ? await db.execute(sql`SELECT id, type FROM transactions WHERE id = ${entityId} AND company_id = ${companyId} LIMIT 1`)
    : entityType === "employee"
      ? await db.execute(sql`SELECT id FROM contacts WHERE id = ${entityId} AND company_id = ${companyId} AND type = 'employee' LIMIT 1`)
      : entityType === "vat_code"
        ? await db.execute(sql`SELECT id FROM vat_codes WHERE id = ${entityId} AND company_id = ${companyId} LIMIT 1`)
        : entityType === "rcm_declaration"
          ? await db.execute(sql`SELECT id FROM rcm_declarations WHERE id = ${entityId} AND company_id = ${companyId} LIMIT 1`)
        : { rows: [{ id: entityId }] };
  if (!target.rows.length) return Response.json({ error: "Record not found." }, { status: 404 });
  const transactionType = String("type" in target.rows[0] ? target.rows[0].type ?? "" : "");
  const canChangeTransaction = entityType === "transaction" && canAttachToTransaction(authorization, transactionType);
  const canChangeReport = entityType === "report" && hasPermission(authorization, "reports:read");
  const canChangeRcm = entityType === "rcm_declaration" && hasPermission(authorization, "purchases:write");
  if (!canChangeTransaction && !canChangeReport && !canChangeRcm && !isAdministrator(authorization)) return Response.json({ error: "You cannot change attachments on this record." }, { status: 403 });
  const count = await db.execute(sql`SELECT count(*)::int AS total FROM record_attachments WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}`);
  if (Number(count.rows[0]?.total ?? 0) + files.length > MAX_FILES) return Response.json({ error: "A record can have at most 10 attachments." }, { status: 409 });
  for (const file of files) {
    await db.execute(sql`
      INSERT INTO record_attachments (company_id, entity_type, entity_id, file_name, mime_type, file_data, file_size)
      VALUES (${companyId}, ${entityType}, ${entityId}, ${String(file.fileName)}, ${String(file.mimeType)}, ${String(file.fileData)}, ${Number(file.fileSize)})
    `);
  }
  return Response.json({ success: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const id = Number(payload.id);
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read", true);
  if (authorization instanceof Response) return authorization;
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid attachment." }, { status: 400 });
  const existing = await getDb().execute(sql`SELECT a.entity_type, t.type AS transaction_type FROM record_attachments a LEFT JOIN transactions t ON a.entity_type = 'transaction' AND t.id = a.entity_id AND t.company_id = a.company_id WHERE a.id = ${id} AND a.company_id = ${companyId} LIMIT 1`);
  if (!existing.rows.length) return Response.json({ error: "Attachment not found." }, { status: 404 });
  const transactionType = String(existing.rows[0].transaction_type ?? "");
  const canChangeTransaction = canAttachToTransaction(authorization, transactionType);
  const canChangeReport = String(existing.rows[0].entity_type) === "report" && hasPermission(authorization, "reports:read");
  const canChangeRcm = String(existing.rows[0].entity_type) === "rcm_declaration" && hasPermission(authorization, "purchases:write");
  if (!canChangeTransaction && !canChangeReport && !canChangeRcm && !isAdministrator(authorization)) return Response.json({ error: "You cannot change attachments on this record." }, { status: 403 });
  await getDb().execute(sql`DELETE FROM record_attachments WHERE id = ${id} AND company_id = ${companyId}`);
  return Response.json({ success: true });
}
