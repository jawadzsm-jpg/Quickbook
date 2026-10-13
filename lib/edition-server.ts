import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { DEFAULT_EDITION, editionDetails, editionLimitMessage, editionOf, type Edition, type EditionUsage } from "./edition";

/** The installation's EasyBook edition; the default (multi company) before migration 0120 has run. */
export async function currentEdition(): Promise<Edition> {
  try {
    const result = await getDb().execute(sql`SELECT edition FROM app_settings WHERE id = 1`);
    return editionOf(result.rows[0]?.edition);
  } catch { return DEFAULT_EDITION; }
}

export async function editionUsage(): Promise<EditionUsage> {
  const db = getDb();
  const [companies, inventories, warehouses] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS count FROM companies WHERE active`),
    db.execute(sql`SELECT c.name, count(*)::int AS count FROM inventory_locations l JOIN companies c ON c.id = l.company_id
      WHERE l.active AND c.active GROUP BY c.id, c.name ORDER BY count DESC, c.name LIMIT 1`),
    db.execute(sql`SELECT c.name || ' · ' || l.name AS name, count(*)::int AS count FROM warehouses w
      JOIN inventory_locations l ON l.id = w.location_id JOIN companies c ON c.id = w.company_id
      WHERE w.active AND l.active AND c.active GROUP BY c.name, l.id, l.name ORDER BY count DESC, name LIMIT 1`),
  ]);
  const top = (rows: Record<string, unknown>[]) => ({ name: String(rows[0]?.name ?? ""), count: Number(rows[0]?.count ?? 0) });
  return { companies: Number(companies.rows[0]?.count ?? 0), inventories: top(inventories.rows), warehouses: top(warehouses.rows) };
}

/**
 * 409 response when adding (or reactivating) one more company, inventory or warehouse would exceed the edition;
 * null when allowed. `existing` counts the active records already in the same scope.
 */
export async function editionLimitResponse(what: "company" | "inventory" | "warehouse", existing: number) {
  const edition = await currentEdition();
  const limits = editionDetails[edition];
  const allowed = what === "company" ? limits.multiCompany : what === "inventory" ? limits.multiInventory : limits.multiWarehouse;
  return allowed || existing < 1 ? null : Response.json({ error: editionLimitMessage(what, edition), code: "EDITION_LIMIT" }, { status: 409 });
}
