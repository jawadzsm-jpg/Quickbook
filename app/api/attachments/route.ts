import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireCompanyAccess } from "@/lib/auth";

type AttachmentInput = { fileName?: string; mimeType?: string; fileData?: string; fileSize?: number };

const allowedTypes = new Set(["transaction", "employee"]);
const allowedMimePrefixes = ["image/", "text/"];
const allowedMimes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/octet-stream",
]);
const MAX_FILE_SIZE = 3_000_000;
const MAX_FILES = 10;

function validMime(value: string) {
  return allowedMimes.has(value) || allowedMimePrefixes.some((prefix) => value.startsWith(prefix));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const entityId = Number(url.searchParams.get("entityId"));
  const entityType = String(url.searchParams.get("entityType") ?? "");
  const authorization = await requireCompanyAccess(request, companyId, "workspace:read");
  if (authorization instanceof Response) return authorization;
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
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
  const authorization = await requireCompanyAccess(request, companyId, true, true);
  if (authorization instanceof Response) return authorization;
  if (!allowedTypes.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) return Response.json({ error: "Select a valid record." }, { status: 400 });
  const files = Array.isArray(payload.attachments) ? payload.attachments.slice(0, MAX_FILES) as AttachmentInput[] : [];
  if (!files.length) return Response.json({ error: "Choose at least one attachment." }, { status: 400 });
  for (const file of files) {
    const fileName = String(file.fileName ?? "attachment").trim().slice(0, 240);
    const mimeType = String(file.mimeType ?? "application/octet-stream").trim().slice(0, 120);
    const fileData = String(file.fileData ?? "");
    const fileSize = Number(file.fileSize ?? 0);
    if (!fileName || !validMime(mimeType) || !fileData.startsWith("data:") || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: "Attachments must be supported files up to 3 MB each." }, { status: 400 });
    }
  }
  const db = getDb();
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
  const authorization = await requireCompanyAccess(request, companyId, true, true);
  if (authorization instanceof Response) return authorization;
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid attachment." }, { status: 400 });
  await getDb().execute(sql`DELETE FROM record_attachments WHERE id = ${id} AND company_id = ${companyId}`);
  return Response.json({ success: true });
}