import { and, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog } from "@/db/schema";
import { keepAuditActor } from "@/lib/audit-actor";
import { isGlobalAdmin, requireCompanyAccess, type SessionUser } from "@/lib/auth";

// Audit Trail report: All-Admin users correct (edit the details text of) or delete one audit entry. Every other role gets 403.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const MAX_DETAILS = 4000;

async function allAdminEntry(request: Request): Promise<{ user: SessionUser; companyId: number; id: number; payload: Record<string, unknown> } | Response> {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!isGlobalAdmin(user)) return json({ error: "Only All-Admin users can edit or delete audit entries." }, 403);
  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Select an audit entry." }, 400);
  return { user, companyId, id, payload };
}

const actor = (user: SessionUser) => ({ actorId: user.id, actorName: user.fullName || user.email });

/** Edit the details (reason / notes) of one audit entry. `expectedDetails` rejects an edit made over a newer change. */
export async function PATCH(request: Request) {
  const context = await allAdminEntry(request);
  if (context instanceof Response) return context;
  const { user, companyId, id, payload } = context;
  if (typeof payload.details !== "string") return json({ error: "Enter the details." }, 400);
  const text = payload.details.trim();
  if (!text) return json({ error: "Enter the details." }, 400);
  return withWriteTransaction(async () => {
    const db = getDb();
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.id, id), eq(auditLog.companyId, companyId))).for("update");
    if (!entry) return json({ error: "This audit entry no longer exists." }, 404);
    if (typeof payload.expectedDetails === "string" && payload.expectedDetails !== entry.details) return json({ error: "This audit entry was changed by someone else. Reload the report and try again." }, 409);
    // The By column reads the user from the details, so the edit keeps the original user.
    const details = keepAuditActor(entry.details, text);
    if (details.length > MAX_DETAILS) return json({ error: `Details can be up to ${MAX_DETAILS} characters.` }, 400);
    if (entry.details === details) return json({ entry });
    const [updated] = await db.update(auditLog).set({ details }).where(and(eq(auditLog.id, id), eq(auditLog.companyId, companyId))).returning();
    // The correction itself stays on record.
    await db.insert(auditLog).values({ companyId, action: "audit-entry-edited", entityType: "audit_log", entityId: id, details: JSON.stringify({ ...actor(user), action: entry.action, entityType: entry.entityType, entityId: entry.entityId, createdAt: entry.createdAt, previousDetails: entry.details }) });
    return json({ entry: updated });
  });
}

/** Delete one audit entry. A record of the deletion (with the removed entry) is kept. */
export async function DELETE(request: Request) {
  const context = await allAdminEntry(request);
  if (context instanceof Response) return context;
  const { user, companyId, id } = context;
  return withWriteTransaction(async () => {
    const db = getDb();
    const [entry] = await db.delete(auditLog).where(and(eq(auditLog.id, id), eq(auditLog.companyId, companyId))).returning();
    if (!entry) return json({ error: "This audit entry no longer exists." }, 404);
    await db.insert(auditLog).values({ companyId, action: "audit-entry-deleted", entityType: "audit_log", entityId: id, details: JSON.stringify({ ...actor(user), action: entry.action, entityType: entry.entityType, entityId: entry.entityId, createdAt: entry.createdAt, details: entry.details }) });
    return json({ deleted: id });
  });
}
