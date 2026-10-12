import { and, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog, itemOffers, items } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { canManageOffers, validateOffer } from "@/lib/item-offers";
import { currentOfferCondition } from "@/lib/item-offers-sql";

// Today Offer: administrators and inventory managers set a special selling price for an item between a start and an end.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!canManageOffers(user)) return json({ error: "Only an administrator or inventory manager can create offers." }, 403);
  const itemId = Number(payload.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) return json({ error: "Select an item." }, 400);
  const checked = validateOffer({ offerPrice: payload.offerPrice, offerQuantity: payload.offerQuantity, startsAt: payload.startsAt, endsAt: payload.endsAt, note: payload.note });
  if ("error" in checked) return json({ error: checked.error }, 400);
  const { offerPrice, offerQuantity, startsAt, endsAt, note } = checked.value;
  return withWriteTransaction(async () => {
    const db = getDb();
    const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.companyId, companyId))).limit(1).for("update");
    if (!item || item.status !== "active") return json({ error: "Select an active item in this company." }, 404);
    // One offer per item at a time: a new offer replaces any running or scheduled one.
    const now = new Date().toISOString();
    const endedByName = user.fullName || user.email;
    await db.update(itemOffers).set({ endedAt: now, endedByName }).where(and(eq(itemOffers.itemId, itemId), currentOfferCondition()));
    const [offer] = await db.insert(itemOffers).values({ companyId, itemId, offerPrice, offerQuantity, startsAt, endsAt, note, createdByUserId: user.id, createdByName: endedByName }).returning();
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "item_offer", entityId: offer.id, details: JSON.stringify({ itemId, sku: item.sku, salesPrice: item.salesPrice, offerPrice, offerQuantity, startsAt, endsAt, actorId: user.id }) });
    return json({ offer }, 201);
  });
}

/** End an offer early (or cancel a scheduled one). */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!canManageOffers(user)) return json({ error: "Only an administrator or inventory manager can end offers." }, 403);
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Select an offer." }, 400);
  const [offer] = await getDb().update(itemOffers).set({ endedAt: new Date().toISOString(), endedByName: user.fullName || user.email })
    .where(and(eq(itemOffers.id, id), eq(itemOffers.companyId, companyId), currentOfferCondition())).returning();
  if (!offer) return json({ error: "This offer has already ended." }, 404);
  await getDb().insert(auditLog).values({ companyId, action: "ended", entityType: "item_offer", entityId: id, details: JSON.stringify({ itemId: offer.itemId, actorId: user.id }) });
  return json({ offer });
}
