import { apiRoute } from "@/lib/api";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireCompanyAccess } from "@/lib/auth";

import { MAX_FILES, parseAttachment } from "@/lib/attachments";

const allowedTypes = new Set(["transaction", "employee"]);

async function handleGET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const entityId = Number(url.searchParams.get("entityId"));
  const entityType = String(url.searchParams.get("entityType") ?? "");
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read");
  if (authorization instanceof Response) return authorization;
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
  const attachmentId = Number(url.searchParams.get("attachmentId"));
  if (url.searchParams.has("attachmentId")) {
    if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) return Response.json({ error: "Select a valid attachment." }, { status: 400 });
    const result = await getDb().execute(sql`SELECT file_name, mime_type, file_data, file_size FROM record_attachments WHERE id = ${attachmentId} AND company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}`);
    const row = result.rows[0];
    if (!row) return Response.json({ error: "Attachment not found." }, { status: 404 });
    const file = parseAttachment({ fileName: row.file_name, mimeType: row.mime_type, fileData: row.file_data, fileSize: row.file_size });
    if (!file) return Response.json({ error: "The stored attachment is invalid." }, { status: 500 });
    const bytes = Buffer.from(file.fileData.slice(file.fileData.indexOf(",") + 1), "base64");
    const encodedName = encodeURIComponent(file.fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(bytes, { headers: { "Content-Type": file.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
  }
  const result = await getDb().execute(sql`
    SELECT id, file_name, mime_type, file_size, created_at
    FROM record_attachments
    WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}
    ORDER BY id DESC
  `);
  return Response.json({ attachments: result.rows });
}

async function handlePOST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const entityId = Number(payload.entityId);
  const entityType = String(payload.entityType ?? "");
  const authorization = await requireCompanyAccess(request, companyId, true, true);
  if (authorization instanceof Response) return authorization;
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
  const rawFiles = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!rawFiles.length || rawFiles.length > MAX_FILES) return Response.json({ error: "Choose between 1 and 10 attachments." }, { status: 400 });
  const files = rawFiles.map(parseAttachment);
  if (files.some((file) => !file)) return Response.json({ error: "Attachments must be supported files up to 3 MB with a matching size and content type." }, { status: 400 });
  const db = getDb();
  const entity = entityType === "transaction"
    ? await db.execute(sql`SELECT id FROM transactions WHERE id = ${entityId} AND company_id = ${companyId}`)
    : await db.execute(sql`SELECT id FROM contacts WHERE id = ${entityId} AND company_id = ${companyId} AND type = 'employee'`);
  if (!entity.rows.length) return Response.json({ error: "Record not found in this company." }, { status: 404 });
  const existing = await db.execute(sql`SELECT count(*)::int AS count FROM record_attachments WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}`);
  if (Number(existing.rows[0]?.count ?? 0) + files.length > MAX_FILES) return Response.json({ error: "A record can have at most 10 attachments." }, { status: 409 });
  for (const file of files) {
    if (!file) continue;
    await db.execute(sql`
      INSERT INTO record_attachments (company_id, entity_type, entity_id, file_name, mime_type, file_data, file_size)
      VALUES (${companyId}, ${entityType}, ${entityId}, ${String(file.fileName)}, ${String(file.mimeType)}, ${String(file.fileData)}, ${Number(file.fileSize)})
    `);
  }
  return Response.json({ success: true }, { status: 201 });
}

async function handleDELETE(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const id = Number(payload.id);
  const authorization = await requireCompanyAccess(request, companyId, true, true);
  if (authorization instanceof Response) return authorization;
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid attachment." }, { status: 400 });
  await getDb().execute(sql`DELETE FROM record_attachments WHERE id = ${id} AND company_id = ${companyId}`);
  return Response.json({ success: true });
}
export const GET = apiRoute(handleGET, { maxBytes: 41_000_000 });

export const POST = apiRoute(handlePOST, { transaction: true, maxBytes: 41_000_000 });

export const DELETE = apiRoute(handleDELETE, { transaction: true, maxBytes: 41_000_000 });
