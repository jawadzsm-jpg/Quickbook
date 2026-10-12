import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, withWriteTransaction } from "../../../db";
import { auditLog, items, warehouses, warehouseTransfers } from "../../../db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";
import { dubaiDay } from "@/lib/document-access";
import { adjustWarehouseStock, warehouseQuantities } from "@/lib/warehouses";

const message = (error: unknown) => error instanceof Error ? error.message : "Could not move stock between warehouses.";
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; };

/** Recent moves between warehouses of one inventory (?companyId=&locationId=). */
export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
  try {
    const url = new URL(request.url);
    const companyId = positiveId(url.searchParams.get("companyId")), locationId = positiveId(url.searchParams.get("locationId"));
    if (!companyId || !locationId) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const db = getDb();
    const rows = await db.select({ id: warehouseTransfers.id, itemId: warehouseTransfers.itemId, sku: items.sku, name: items.name, fromWarehouseId: warehouseTransfers.fromWarehouseId, toWarehouseId: warehouseTransfers.toWarehouseId, quantity: warehouseTransfers.quantity, reference: warehouseTransfers.reference, transferDate: warehouseTransfers.transferDate, notes: warehouseTransfers.notes, createdByName: warehouseTransfers.createdByName, createdAt: warehouseTransfers.createdAt })
      .from(warehouseTransfers).innerJoin(items, eq(items.id, warehouseTransfers.itemId))
      .where(and(eq(warehouseTransfers.companyId, companyId), eq(warehouseTransfers.locationId, locationId)))
      .orderBy(desc(warehouseTransfers.createdAt), desc(warehouseTransfers.id)).limit(200);
    return Response.json({ transfers: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Move stock between two warehouses of the same inventory: { companyId, locationId, fromWarehouseId, toWarehouseId, lines: [{ itemId, quantity }], reference?, transferDate?, notes? }. */
export async function POST(request: Request) {
  const authorization = await requireApiUser(request, "inventory:transfer", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = positiveId(payload.companyId), locationId = positiveId(payload.locationId);
    const fromWarehouseId = positiveId(payload.fromWarehouseId), toWarehouseId = positiveId(payload.toWarehouseId);
    if (!companyId || !locationId || !fromWarehouseId || !toWarehouseId) return Response.json({ error: "Select the inventory and both warehouses." }, { status: 400 });
    if (fromWarehouseId === toWarehouseId) return Response.json({ error: "Choose two different warehouses." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const rawLines = Array.isArray(payload.lines) ? payload.lines as Array<Record<string, unknown>> : [];
    const requested = new Map<number, number>();
    for (const line of rawLines) {
      const itemId = positiveId(line.itemId), quantity = Number(line.quantity);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return Response.json({ error: "Complete every line with a product and a quantity above zero." }, { status: 400 });
      requested.set(itemId, Math.round(((requested.get(itemId) ?? 0) + quantity) * 1e6) / 1e6);
    }
    if (!requested.size || requested.size > 100) return Response.json({ error: "Add 1 to 100 products to move." }, { status: 400 });
    const transferDate = String(payload.transferDate ?? "").trim() || dubaiDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return Response.json({ error: "Enter a valid date." }, { status: 400 });
    const reference = (String(payload.reference ?? "").trim().toUpperCase() || `WHT-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`).slice(0, 40);
    if (!/^[-A-Z0-9/]{2,40}$/.test(reference)) return Response.json({ error: "Enter a valid reference (letters, numbers, dashes)." }, { status: 400 });
    const notes = String(payload.notes ?? "").trim().slice(0, 500);
    return await withWriteTransaction(async () => {
      const db = getDb();
      const pair = await db.select().from(warehouses).where(and(eq(warehouses.companyId, companyId), eq(warehouses.locationId, locationId), inArray(warehouses.id, [fromWarehouseId, toWarehouseId]))).for("update");
      const from = pair.find((row) => row.id === fromWarehouseId), to = pair.find((row) => row.id === toWarehouseId);
      if (!from || !to) return Response.json({ error: "Both warehouses must belong to this inventory." }, { status: 400 });
      if (!to.active) return Response.json({ error: `Warehouse ${to.name} is inactive.` }, { status: 409 });
      const itemIds = [...requested.keys()].sort((a, b) => a - b);
      const stock = await db.select({ id: items.id, sku: items.sku, name: items.name, itemType: items.itemType }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, itemIds))).orderBy(asc(items.id)).for("update");
      if (stock.length !== itemIds.length) return Response.json({ error: "Select products from this inventory." }, { status: 400 });
      if (stock.some((item) => item.itemType !== "stock-part")) return Response.json({ error: "Only stock items can be moved between warehouses." }, { status: 400 });
      const available = await warehouseQuantities(db, fromWarehouseId, itemIds);
      const short = stock.find((item) => (requested.get(item.id) ?? 0) > (available.get(item.id) ?? 0) + 0.000001);
      if (short) return Response.json({ error: `Not enough stock in ${from.name}. ${short.sku} ${short.name}: available ${available.get(short.id) ?? 0}, requested ${requested.get(short.id)}.` }, { status: 409 });
      const createdByName = authorization.fullName || authorization.email;
      const rows = [];
      for (const item of stock) {
        const quantity = requested.get(item.id)!;
        await adjustWarehouseStock(db, fromWarehouseId, item.id, -quantity);
        await adjustWarehouseStock(db, toWarehouseId, item.id, quantity);
        const [row] = await db.insert(warehouseTransfers).values({ companyId, locationId, itemId: item.id, fromWarehouseId, toWarehouseId, quantity, reference, transferDate, notes, createdByUserId: authorization.id, createdByName }).returning();
        rows.push(row);
      }
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "warehouse_transfer", entityId: rows[0].id, details: JSON.stringify({ actorId: authorization.id, reference, from: from.name, to: to.name, lines: rows.map((row) => ({ itemId: row.itemId, quantity: row.quantity })) }) });
      return Response.json({ transfers: rows }, { status: 201 });
    });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Reverse one move line (Administrator): the stock goes back if the destination warehouse still has it. */
export async function DELETE(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = positiveId(payload.companyId), id = positiveId(payload.id);
    if (!companyId || !id) return Response.json({ error: "Select a warehouse move." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [move] = await db.select().from(warehouseTransfers).where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.companyId, companyId))).for("update");
      if (!move) return Response.json({ error: "Warehouse move not found." }, { status: 404 });
      await db.select({ id: items.id }).from(items).where(eq(items.id, move.itemId)).for("update");
      const inDestination = (await warehouseQuantities(db, move.toWarehouseId, [move.itemId])).get(move.itemId) ?? 0;
      if (inDestination < move.quantity - 0.000001) return Response.json({ error: "The destination warehouse no longer has this stock, so the move cannot be reversed." }, { status: 409 });
      await adjustWarehouseStock(db, move.toWarehouseId, move.itemId, -move.quantity);
      await adjustWarehouseStock(db, move.fromWarehouseId, move.itemId, move.quantity);
      await db.delete(warehouseTransfers).where(eq(warehouseTransfers.id, id));
      await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "warehouse_transfer", entityId: id, details: JSON.stringify({ actorId: authorization.id, before: move, stockReversed: true }) });
      return Response.json({ deleted: true });
    });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
