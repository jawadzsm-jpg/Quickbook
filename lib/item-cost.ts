import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { transactionLines, transactions } from "@/db/schema";

// The cost of sales for a stock item is what it was bought for: the weighted average of its supplier bills and item
// receipts (quantity × unit price + line freight, at each document's exchange rate, in home currency), ignoring
// cancelled, void and draft purchases. This is the same figure the Items list shows as average cost.
export async function averagePurchaseCosts(itemIds: number[]) {
  const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))];
  const costs = new Map<number, number>();
  if (!ids.length) return costs;
  const rows = await getDb().select({
    itemId: transactionLines.itemId,
    quantity: sql<number>`coalesce(sum(${transactionLines.quantity}), 0)`,
    value: sql<number>`coalesce(sum((${transactionLines.quantity} * ${transactionLines.unitPrice} + ${transactionLines.freightCharge}) * ${transactions.exchangeRate}), 0)`,
  }).from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(and(
      inArray(transactionLines.itemId, ids),
      inArray(transactions.type, ["bill", "item receipt"]),
      eq(transactionLines.isFreightCharge, false),
      sql`${transactionLines.quantity} > 0`,
      sql`lower(${transactions.status}) NOT IN ('cancelled', 'canceled', 'void', 'voided', 'deleted', 'draft')`,
    )).groupBy(transactionLines.itemId);
  for (const row of rows) if (row.itemId && Number(row.quantity) > 0) costs.set(row.itemId, Math.round(Number(row.value) / Number(row.quantity) * 100) / 100);
  return costs;
}

/** Home-currency unit cost: average purchase cost, else the last purchase price, else the item's saved cost (ex VAT). */
export function itemHomeCost(item: { id: number; cost: number; lastPurchasePrice?: number | null; amountsIncludeVat?: boolean | null }, averages: Map<number, number>, purchaseVatRate = 0) {
  const average = averages.get(item.id);
  if (average && average > 0) return average;
  const last = Number(item.lastPurchasePrice) || 0;
  if (last > 0) return last;
  const saved = Number(item.cost) || 0;
  return item.amountsIncludeVat && purchaseVatRate > 0 ? saved / (1 + purchaseVatRate / 100) : saved;
}
