import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog, contacts, items, stockHolds } from "@/db/schema";
import { isAdministrator, requireCompanyAccess, type SessionUser } from "@/lib/auth";
import { HOLD_MAX_HOURS, activeHoldCondition } from "@/lib/stock-holds";

// Stock holds: administrators and accountants reserve a quantity of an item for a sales rep for a few hours or days.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const canManageHolds = (user: SessionUser) => isAdministrator(user) || user.role === "accountant";

/** Active sales reps (employees) the hold can be for. */
export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId, "inventory:read");
  if (user instanceof Response) return user;
  const reps = await getDb().select({ name: contacts.name }).from(contacts)
    .where(and(eq(contacts.companyId, companyId), eq(contacts.type, "employee"), eq(contacts.status, "active"))).orderBy(asc(contacts.name));
  return json({ salesReps: reps.map((rep) => rep.name), canManage: canManageHolds(user) });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!canManageHolds(user)) return json({ error: "Only an administrator or accountant can put stock on hold." }, 403);
  const itemId = Number(payload.itemId), quantity = Number(payload.quantity), hours = Number(payload.hours);
  const salesRep = String(payload.salesRep ?? "").trim(), note = String(payload.note ?? "").trim();
  if (!Number.isInteger(itemId) || itemId <= 0) return json({ error: "Select an item." }, 400);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return json({ error: "Enter a quantity to hold." }, 400);
  if (!Number.isFinite(hours) || hours <= 0 || hours > HOLD_MAX_HOURS) return json({ error: `Hold for up to ${HOLD_MAX_HOURS / 24} days.` }, 400);
  if (!salesRep || salesRep.length > 120) return json({ error: "Select the sales rep the stock is held for." }, 400);
  if (note.length > 500) return json({ error: "Keep the note to 500 characters." }, 400);
  return withWriteTransaction(async () => {
    const db = getDb();
    const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.companyId, companyId))).limit(1).for("update");
    if (!item || item.status !== "active") return json({ error: "Select an active item in this company." }, 404);
    if (item.itemType !== "stock-part") return json({ error: "Only stock items can be held." }, 400);
    const active = await db.select({ quantity: stockHolds.quantity }).from(stockHolds).where(and(eq(stockHolds.itemId, itemId), activeHoldCondition()));
    const free = Number(item.quantity) - active.reduce((sum, row) => sum + Number(row.quantity), 0);
    if (quantity > free) return json({ error: `Only ${Math.max(0, free)} of ${item.sku} ${item.name} are free to hold.` }, 409);
    const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
    const [hold] = await db.insert(stockHolds).values({ companyId, itemId, quantity, salesRep, note, expiresAt, createdByUserId: user.id, createdByName: user.fullName || user.email }).returning();
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "stock_hold", entityId: hold.id, details: JSON.stringify({ itemId, sku: item.sku, quantity, salesRep, hours, expiresAt, actorId: user.id }) });
    return json({ hold }, 201);
  });
}

/** Release a hold early. */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!canManageHolds(user)) return json({ error: "Only an administrator or accountant can release a hold." }, 403);
  const ids = (Array.isArray(payload.ids) ? payload.ids : [payload.id]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return json({ error: "Select a hold to release." }, 400);
  return withWriteTransaction(async () => {
    const db = getDb();
    const released = await db.update(stockHolds).set({ releasedAt: new Date().toISOString(), releasedByName: user.fullName || user.email })
      .where(and(inArray(stockHolds.id, ids), eq(stockHolds.companyId, companyId), activeHoldCondition())).returning();
    for (const hold of released) await db.insert(auditLog).values({ companyId, action: "released", entityType: "stock_hold", entityId: hold.id, details: JSON.stringify({ itemId: hold.itemId, quantity: hold.quantity, salesRep: hold.salesRep, actorId: user.id }) });
    return json({ released: released.length });
  });
}
