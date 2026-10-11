import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, auditLog } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";
import { requireCompanyAccess } from "@/lib/auth";

// Admin Controls → API & Integrations: company Administrators create, list and revoke read-only API keys.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const MAX_ACTIVE_KEYS = 20;

const publicKey = (row: typeof apiKeys.$inferSelect) => ({
  id: row.id, name: row.name, keyPrefix: row.keyPrefix, scopes: row.scopes.split(",").filter(Boolean), createdByName: row.createdByName,
  createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, revokedAt: row.revokedAt, revokedByName: row.revokedByName,
});

export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId, true);
  if (user instanceof Response) return user;
  const rows = await getDb().select().from(apiKeys).where(eq(apiKeys.companyId, companyId)).orderBy(desc(apiKeys.createdAt));
  return json({ keys: rows.map(publicKey) });
}

/** Create a key. The full key is returned only in this response. */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, true, true);
  if (user instanceof Response) return user;
  const name = String(payload.name ?? "").trim();
  if (!name || name.length > 80) return json({ error: "Name the key after the website or system that uses it (up to 80 characters)." }, 400);
  const db = getDb();
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.companyId, companyId), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) return json({ error: `A company can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke an unused key first.` }, 409);
  const { key, keyPrefix, keyHash } = generateApiKey();
  const [row] = await db.insert(apiKeys).values({ companyId, name, keyPrefix, keyHash, scopes: "products:read", createdByUserId: user.id, createdByName: user.fullName || user.email }).returning();
  await db.insert(auditLog).values({ companyId, action: "created", entityType: "api_key", entityId: row.id, details: JSON.stringify({ name, keyPrefix, actorId: user.id }) });
  return json({ key: publicKey(row), secret: key }, 201);
}

/** Revoke a key immediately. */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, true, true);
  if (user instanceof Response) return user;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Select a key." }, 400);
  const [row] = await getDb().update(apiKeys).set({ revokedAt: new Date().toISOString(), revokedByName: user.fullName || user.email })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId), isNull(apiKeys.revokedAt))).returning();
  if (!row) return json({ error: "This key is already revoked." }, 404);
  await getDb().insert(auditLog).values({ companyId, action: "revoked", entityType: "api_key", entityId: id, details: JSON.stringify({ name: row.name, keyPrefix: row.keyPrefix, actorId: user.id }) });
  return json({ key: publicKey(row) });
}
