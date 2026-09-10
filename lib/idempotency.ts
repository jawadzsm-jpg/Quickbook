import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { RequestError } from "./errors";

/** Run inside the same transaction as the business write. Successful results are replayable. */
export async function idempotentWrite(request: Request, userId: number, work: () => Promise<Response>) {
  const key = request.headers.get("idempotency-key");
  if (!key) return work();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new RequestError("Use a valid idempotency key.");
  const payload = await request.json();
  const hash = createHash("sha256").update(`${request.method}\n${new URL(request.url).pathname}\n${JSON.stringify(payload)}`).digest("hex");
  const db = getDb();
  const inserted = await db.execute(sql`INSERT INTO idempotency_requests (user_id, request_key, request_hash, company_id) VALUES (${userId}, ${key}, ${hash}, ${payload.companyId ?? null}) ON CONFLICT DO NOTHING RETURNING request_key`);
  if (!inserted.rows.length) {
    const result = await db.execute(sql`SELECT request_hash, response_body, response_status FROM idempotency_requests WHERE user_id = ${userId} AND request_key = ${key}`);
    const previous = result.rows[0];
    if (!previous || previous.request_hash !== hash) throw new RequestError("This request key was already used for different data. Refresh before starting a new entry.", 409);
    if (!previous.response_body || !previous.response_status) throw new RequestError("This request is still processing. Retry shortly with the same key.", 409);
    return Response.json(JSON.parse(String(previous.response_body)), { status: Number(previous.response_status), headers: { "Idempotency-Replayed": "true" } });
  }
  const response = await work();
  if (response.ok) await db.execute(sql`UPDATE idempotency_requests SET response_body = ${JSON.stringify(await response.clone().json())}, response_status = ${response.status} WHERE user_id = ${userId} AND request_key = ${key}`);
  return response;
}
