import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, auditLog, inventoryCheckLines, inventoryCheckReports, inventoryLocations, items } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";

const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update inventory check reports.";
  return message.includes("does not exist") ? "The inventory-check database is being updated. Please refresh in a moment." : message;
}

async function reportForCompany(id: number, companyId: number) {
  const [record] = await getDb().select().from(inventoryCheckReports)
    .where(and(eq(inventoryCheckReports.id, id), eq(inventoryCheckReports.companyId, companyId))).limit(1);
  return record;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    const reportId = Number(url.searchParams.get("reportId"));
    const user = await requireCompanyAccess(request, companyId, "inventory:read");
    if (user instanceof Response) return user;
    const db = getDb();
    if (Number.isInteger(reportId) && reportId > 0) {
      const record = await reportForCompany(reportId, companyId);
      if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
      const lines = await db.select().from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, reportId)).orderBy(asc(inventoryCheckLines.itemName));
      return Response.json({ record, lines });
    }
    const conditions = [eq(inventoryCheckReports.companyId, companyId)];
    if (Number.isInteger(locationId) && locationId > 0) conditions.push(eq(inventoryCheckReports.locationId, locationId));
    const records = await db.select({
      id: inventoryCheckReports.id,
      companyId: inventoryCheckReports.companyId,
      locationId: inventoryCheckReports.locationId,
      memo: inventoryCheckReports.memo,
      createdAt: inventoryCheckReports.createdAt,
      updatedAt: inventoryCheckReports.updatedAt,
      creator: appUsers.fullName,
      creatorEmail: appUsers.email,
      locationName: inventoryLocations.name,
    }).from(inventoryCheckReports)
      .leftJoin(appUsers, eq(inventoryCheckReports.createdByUserId, appUsers.id))
      .innerJoin(inventoryLocations, eq(inventoryCheckReports.locationId, inventoryLocations.id))
      .where(and(...conditions)).orderBy(desc(inventoryCheckReports.createdAt));
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    const memo = clean(payload.memo);
    const user = await requireCompanyAccess(request, companyId, "inventory:read", true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory." }, { status: 400 });
    const db = getDb();
    const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
      .where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
    if (!location) return Response.json({ error: "Inventory not found for this company." }, { status: 404 });
    const stock = await db.select({ id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name, quantity: items.quantity }).from(items)
      .where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), eq(items.status, "active"))).orderBy(asc(items.name));
    const [record] = await db.insert(inventoryCheckReports).values({ companyId, locationId, memo, createdByUserId: user.id }).returning();
    if (stock.length) await db.insert(inventoryCheckLines).values(stock.map((item) => ({ reportId: record.id, itemId: item.id, itemNumber: item.itemNumber ?? "", sku: item.sku, itemName: item.name, systemQuantity: item.quantity, countedQuantity: null })));
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "inventory_check_report", entityId: record.id, details: `Inventory check report #${record.id} created by ${user.email}` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    const memo = clean(payload.memo);
    const user = await requireCompanyAccess(request, companyId, true, true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(payload.lines)) return Response.json({ error: "Invalid inventory check report." }, { status: 400 });
    const record = await reportForCompany(id, companyId);
    if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
    const db = getDb();
    const allowedLines = await db.select({ id: inventoryCheckLines.id }).from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, id));
    const allowedIds = new Set(allowedLines.map((line) => line.id));
    const updates = payload.lines.map((line) => line as Record<string, unknown>).filter((line) => allowedIds.has(Number(line.id))).map((line) => {
      const raw = line.countedQuantity;
      const countedQuantity = raw === "" || raw === null || raw === undefined ? null : Number(raw);
      if (countedQuantity !== null && (!Number.isFinite(countedQuantity) || Math.abs(countedQuantity) > 1_000_000_000)) throw new Error("Enter valid counted quantities.");
      return db.update(inventoryCheckLines).set({ countedQuantity }).where(and(eq(inventoryCheckLines.id, Number(line.id)), eq(inventoryCheckLines.reportId, id)));
    });
    await Promise.all(updates);
    const now = new Date().toISOString();
    const [saved] = await db.update(inventoryCheckReports).set({ memo, updatedAt: now }).where(eq(inventoryCheckReports.id, id)).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "inventory_check_report", entityId: id, details: `Inventory check report #${id} updated by ${user.email}` });
    return Response.json({ record: saved });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    const user = await requireCompanyAccess(request, companyId, true, true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid inventory check report." }, { status: 400 });
    const db = getDb();
    const [record] = await db.delete(inventoryCheckReports).where(and(eq(inventoryCheckReports.id, id), eq(inventoryCheckReports.companyId, companyId))).returning();
    if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
    await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "inventory_check_report", entityId: id, details: `Inventory check report #${id} deleted by ${user.email}` });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
