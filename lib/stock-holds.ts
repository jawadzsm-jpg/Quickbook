import { and, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { stockHolds } from "@/db/schema";
import { sameSalesRep } from "./stock-hold-rules";

export { sameSalesRep };

// A hold reserves stock for one sales rep until it expires or is released. Documents for that rep may use the held
// quantity; every other stock-reducing document (invoice, sales receipt, purchase return, stock transfer) may not.

export const HOLD_MAX_HOURS = 24 * 7;
export const holdDurations = [[4, "4 hours"], [24, "1 day"], [48, "2 days"]] as const;

export function activeHoldCondition() {
  return and(isNull(stockHolds.releasedAt), gt(stockHolds.expiresAt, sql`now()`));
}

/** Active held quantity per item, excluding holds for `salesRep` (whose own documents may use them). */
export async function heldByOthers(itemIds: number[], salesRep?: unknown) {
  const held = new Map<number, number>();
  if (!itemIds.length) return held;
  const rows = await getDb().select({ itemId: stockHolds.itemId, quantity: stockHolds.quantity, salesRep: stockHolds.salesRep })
    .from(stockHolds).where(and(inArray(stockHolds.itemId, itemIds), activeHoldCondition()));
  for (const row of rows) if (!sameSalesRep(row.salesRep, salesRep)) held.set(row.itemId, (held.get(row.itemId) ?? 0) + Number(row.quantity));
  return held;
}

/** Message for a line that would use stock held for someone else. */
export function heldStockMessage(item: { sku: string; name: string; quantity: number | string }, held: number, requested: number) {
  const free = Math.max(0, Number(item.quantity) - held);
  return `${item.sku} ${item.name}: ${free} free (${held} on hold for another sales rep), requested ${requested}`;
}
