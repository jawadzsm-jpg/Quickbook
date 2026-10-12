import { and, eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "../../../db";
import { auditLog, inventoryLocations, warehouses } from "../../../db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";
import { normalizeComparableText } from "@/lib/text-normalization";
import { explicitWarehouseQuantity, switchDefaultWarehouse, warehouseCodePattern, warehouseInUse, warehouseSummaries } from "@/lib/warehouses";

const message = (error: unknown) => error instanceof Error ? error.message : "Could not update warehouses.";
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; };

/** Warehouses of a company's inventories with their stock (?companyId=, optional &locationId=). */
export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const url = new URL(request.url);
    const companyId = positiveId(url.searchParams.get("companyId"));
    const locationId = url.searchParams.get("locationId") ? positiveId(url.searchParams.get("locationId")) : undefined;
    if (!companyId || locationId === null) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return Response.json({ warehouses: await warehouseSummaries(getDb(), companyId, locationId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

async function readFields(payload: Record<string, unknown>) {
  const name = String(payload.name ?? "").trim();
  const code = String(payload.code ?? "").trim().toUpperCase();
  if (!name || name.length > 80) return { error: "Enter a warehouse name (up to 80 characters)." };
  if (!warehouseCodePattern.test(code)) return { error: "Enter a warehouse code of up to 20 letters, numbers or dashes." };
  return { name, code };
}

async function duplicateError(locationId: number, name: string, code: string, ignoreId?: number) {
  const rows = await getDb().select({ id: warehouses.id, name: warehouses.name, code: warehouses.code }).from(warehouses).where(eq(warehouses.locationId, locationId));
  const others = rows.filter((row) => row.id !== ignoreId);
  if (others.some((row) => normalizeComparableText(row.name) === normalizeComparableText(name))) return "A warehouse with this name already exists in this inventory.";
  if (others.some((row) => row.code === code)) return "A warehouse with this code already exists in this inventory.";
  return null;
}

export async function POST(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = positiveId(payload.companyId), locationId = positiveId(payload.locationId);
    if (!companyId || !locationId) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const fields = await readFields(payload);
    if ("error" in fields) return Response.json({ error: fields.error }, { status: 400 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true)));
      if (!location) return Response.json({ error: "Inventory not found." }, { status: 404 });
      const duplicate = await duplicateError(locationId, fields.name, fields.code);
      if (duplicate) return Response.json({ error: duplicate }, { status: 409 });
      const [warehouse] = await db.insert(warehouses).values({ companyId, locationId, name: fields.name, code: fields.code }).returning();
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "warehouse", entityId: warehouse.id, details: JSON.stringify({ actorId: authorization.id, locationId, name: fields.name, code: fields.code }) });
      return Response.json({ warehouse }, { status: 201 });
    });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** action: "update" (name/code), "activate", "deactivate" or "setDefault". */
export async function PATCH(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = positiveId(payload.companyId), id = positiveId(payload.id);
    const action = String(payload.action ?? "");
    if (!companyId || !id || !["update", "activate", "deactivate", "setDefault"].includes(action)) return Response.json({ error: "Select a warehouse and action." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [existing] = await db.select().from(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId))).for("update");
      if (!existing) return Response.json({ error: "Warehouse not found." }, { status: 404 });
      let after: Record<string, unknown> = {};
      if (action === "update") {
        const fields = await readFields(payload);
        if ("error" in fields) return Response.json({ error: fields.error }, { status: 400 });
        const duplicate = await duplicateError(existing.locationId, fields.name, fields.code, id);
        if (duplicate) return Response.json({ error: duplicate }, { status: 409 });
        await db.update(warehouses).set({ name: fields.name, code: fields.code }).where(eq(warehouses.id, id));
        after = fields;
      } else if (action === "activate") {
        await db.update(warehouses).set({ active: true }).where(eq(warehouses.id, id));
        after = { active: true };
      } else if (action === "deactivate") {
        if (existing.isDefault) return Response.json({ error: "The default warehouse cannot be deactivated. Make another warehouse the default first." }, { status: 409 });
        if (await explicitWarehouseQuantity(db, id) > 0.000001) return Response.json({ error: "This warehouse still holds stock. Move its stock to another warehouse first." }, { status: 409 });
        await db.update(warehouses).set({ active: false }).where(eq(warehouses.id, id));
        after = { active: false };
      } else {
        if (existing.isDefault) return Response.json({ warehouse: existing });
        const [oldDefault] = await db.select().from(warehouses).where(and(eq(warehouses.locationId, existing.locationId), eq(warehouses.isDefault, true))).for("update");
        // Lock the inventory's items so no document posts while the remainder moves to the new default.
        await db.execute(sql`SELECT id FROM items WHERE location_id = ${existing.locationId} FOR UPDATE`);
        if (oldDefault) await switchDefaultWarehouse(db, companyId, existing.locationId, oldDefault.id, id);
        else await db.update(warehouses).set({ isDefault: true, active: true }).where(eq(warehouses.id, id));
        after = { isDefault: true, previousDefaultId: oldDefault?.id ?? null };
      }
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "warehouse", entityId: id, details: JSON.stringify({ actorId: authorization.id, action, before: existing, after }) });
      const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
      return Response.json({ warehouse });
    });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Remove a non-default warehouse that holds no stock and that no document or stock history uses. */
export async function DELETE(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = positiveId(payload.companyId), id = positiveId(payload.id);
    if (!companyId || !id) return Response.json({ error: "Select a warehouse." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [existing] = await db.select().from(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId))).for("update");
      if (!existing) return Response.json({ error: "Warehouse not found." }, { status: 404 });
      if (existing.isDefault) return Response.json({ error: "The default warehouse cannot be removed." }, { status: 409 });
      if (await explicitWarehouseQuantity(db, id) > 0.000001) return Response.json({ error: "This warehouse still holds stock. Move its stock to another warehouse first." }, { status: 409 });
      if (await warehouseInUse(db, id)) return Response.json({ error: "Documents or stock history use this warehouse, so it cannot be removed. Deactivate it instead." }, { status: 409 });
      await db.delete(warehouses).where(eq(warehouses.id, id));
      await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "warehouse", entityId: id, details: JSON.stringify({ actorId: authorization.id, before: existing }) });
      return Response.json({ ok: true });
    });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
