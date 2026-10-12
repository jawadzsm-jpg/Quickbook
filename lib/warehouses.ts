import { sql } from "drizzle-orm";

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> };

export type WarehouseSummary = { id: number; companyId: number; locationId: number; code: string; name: string; isDefault: boolean; active: boolean; itemCount: number; quantity: number };

export const warehouseCodePattern = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

/**
 * Warehouses of a company's inventories with their stock. items.quantity is the inventory total; non-default
 * warehouses keep explicit quantities in warehouse_stock, and the default warehouse holds the remainder.
 */
export async function warehouseSummaries(db: Executor, companyId: number, locationId?: number): Promise<WarehouseSummary[]> {
  const locationFilter = locationId ? sql`AND w.location_id = ${locationId}` : sql``;
  const result = await db.execute(sql`
    WITH explicit AS (
      SELECT ws.item_id, ws.warehouse_id, ws.quantity FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE w.company_id = ${companyId} AND NOT w.is_default ${locationFilter}
    ), remainder AS (
      SELECT i.id AS item_id, i.location_id, i.quantity - COALESCE((SELECT SUM(e.quantity) FROM explicit e WHERE e.item_id = i.id), 0) AS quantity
      FROM items i WHERE i.company_id = ${companyId}
    )
    SELECT w.id, w.company_id, w.location_id, w.code, w.name, w.is_default, w.active,
      CASE WHEN w.is_default
        THEN (SELECT COUNT(*) FROM remainder r WHERE r.location_id = w.location_id AND abs(r.quantity) > 0.000001)
        ELSE (SELECT COUNT(*) FROM explicit e WHERE e.warehouse_id = w.id AND abs(e.quantity) > 0.000001) END AS item_count,
      CASE WHEN w.is_default
        THEN (SELECT COALESCE(SUM(r.quantity), 0) FROM remainder r WHERE r.location_id = w.location_id)
        ELSE (SELECT COALESCE(SUM(e.quantity), 0) FROM explicit e WHERE e.warehouse_id = w.id) END AS quantity
    FROM warehouses w WHERE w.company_id = ${companyId} ${locationFilter}
    ORDER BY w.location_id, w.is_default DESC, w.name`);
  return result.rows.map((row) => ({
    id: Number(row.id), companyId: Number(row.company_id), locationId: Number(row.location_id), code: String(row.code), name: String(row.name),
    isDefault: Boolean(row.is_default), active: Boolean(row.active), itemCount: Number(row.item_count), quantity: Number(row.quantity),
  }));
}

/** Explicit stock held in a non-default warehouse (the default warehouse has none by design). */
export async function explicitWarehouseQuantity(db: Executor, warehouseId: number) {
  const result = await db.execute(sql`SELECT COALESCE(SUM(abs(quantity)), 0) AS quantity FROM warehouse_stock WHERE warehouse_id = ${warehouseId}`);
  return Number(result.rows[0]?.quantity ?? 0);
}

/**
 * Make another warehouse the default without moving stock: the old default's remainder becomes explicit rows, and the
 * new default's explicit rows are absorbed into the remainder. Callers lock the inventory's items first.
 */
export async function switchDefaultWarehouse(db: Executor, companyId: number, locationId: number, oldDefaultId: number, newDefaultId: number) {
  await db.execute(sql`
    INSERT INTO warehouse_stock (company_id, warehouse_id, item_id, quantity)
    SELECT ${companyId}, ${oldDefaultId}, i.id,
      i.quantity - COALESCE((SELECT SUM(ws.quantity) FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id WHERE ws.item_id = i.id AND NOT w.is_default), 0)
    FROM items i WHERE i.location_id = ${locationId}
    ON CONFLICT (warehouse_id, item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = now()`);
  await db.execute(sql`DELETE FROM warehouse_stock WHERE warehouse_id = ${oldDefaultId} AND abs(quantity) <= 0.000001`);
  await db.execute(sql`DELETE FROM warehouse_stock WHERE warehouse_id = ${newDefaultId}`);
  await db.execute(sql`UPDATE warehouses SET is_default = false WHERE id = ${oldDefaultId}`);
  await db.execute(sql`UPDATE warehouses SET is_default = true, active = true WHERE id = ${newDefaultId}`);
}
