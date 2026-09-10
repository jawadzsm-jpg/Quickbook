import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { MAX_FILES, parseAttachment } from "./attachments";
import { RequestError } from "./errors";

/** Called inside the parent write transaction, so attachments and record commit together. */
export async function insertRecordAttachments(companyId: number, entityType: "transaction" | "employee", entityId: number, input: unknown) {
  if (input === undefined) return;
  if (!Array.isArray(input) || input.length > MAX_FILES) throw new RequestError("A record can have at most 10 attachments.");
  const files = input.map(parseAttachment);
  if (files.some((file) => !file)) throw new RequestError("Attachments must be supported files up to 3 MB each.");
  if (!files.length) return;
  const db = getDb();
  const existing = await db.execute(sql`SELECT count(*)::int AS count FROM record_attachments WHERE company_id = ${companyId} AND entity_type = ${entityType} AND entity_id = ${entityId}`);
  if (Number(existing.rows[0]?.count ?? 0) + files.length > MAX_FILES) throw new RequestError("A record can have at most 10 attachments.", 409);
  const values = files.map((file) => sql`(${companyId}, ${entityType}, ${entityId}, ${file!.fileName}, ${file!.mimeType}, ${file!.fileData}, ${file!.fileSize})`);
  await db.execute(sql`INSERT INTO record_attachments (company_id, entity_type, entity_id, file_name, mime_type, file_data, file_size) VALUES ${sql.join(values, sql`, `)}`);
}
