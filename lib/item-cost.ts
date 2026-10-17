import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { transactionLines, transactions } from "@/db/schema";
import { STOCK_ADJUSTMENT_TYPE, adjustmentCostLayer, valueAdjustmentComments, weightedAverageTotals, weightedUnitCost, type CostLayer } from "@/lib/stock-adjustment";

// The cost of sales for a stock item is what it was bought for: the weighted average of its supplier bills and item
// receipts (quantity × unit price + line freight, at each document's exchange rate, in home currency), ignoring
// cancelled, void and draft purchases. A stock adjustment that sets the item's total value restarts the average from
// the value it set, so later purchases average on top of it. This is the same figure the Items list shows as average
// cost and the stock reports value stock at.
export async function weightedPurchaseTotals(itemIds: number[]) {
  const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map<number, { quantity: number; value: number }>();
  const db = getDb();
  const [purchases, adjustments] = await Promise.all([
    db.select({
      itemId: transactionLines.itemId,
      transactionId: transactions.id,
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
      )).groupBy(transactionLines.itemId, transactions.id),
    db.select({ itemId: transactionLines.itemId, transactionId: transactions.id, transactionComments: transactions.comments, lineComments: transactionLines.comments }).from(transactionLines)
      .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
      .where(and(inArray(transactionLines.itemId, ids), eq(transactions.type, STOCK_ADJUSTMENT_TYPE), inArray(transactions.comments, valueAdjustmentComments))),
  ]);
  const layers: CostLayer[] = purchases.flatMap((row) => row.itemId ? [{ itemId: row.itemId, transactionId: row.transactionId, quantity: Number(row.quantity), value: Number(row.value) }] : []);
  for (const line of adjustments) { const layer = adjustmentCostLayer(line); if (layer) layers.push(layer); }
  return weightedAverageTotals(layers);
}

export async function averagePurchaseCosts(itemIds: number[]) {
  const costs = new Map<number, number>();
  for (const [itemId, totals] of await weightedPurchaseTotals(itemIds)) { const cost = weightedUnitCost(totals); if (cost !== undefined) costs.set(itemId, cost); }
  return costs;
}

/**
 * Home-currency unit cost: average purchase cost (zero when stock was written down to no value), else the last purchase
 * price, else the item's saved cost (ex VAT).
 */
export function itemHomeCost(item: { id: number; cost: number; lastPurchasePrice?: number | null; amountsIncludeVat?: boolean | null }, averages: Map<number, number>, purchaseVatRate = 0) {
  const average = averages.get(item.id);
  if (average !== undefined && average >= 0) return average;
  const last = Number(item.lastPurchasePrice) || 0;
  if (last > 0) return last;
  const saved = Number(item.cost) || 0;
  return item.amountsIncludeVat && purchaseVatRate > 0 ? saved / (1 + purchaseVatRate / 100) : saved;
}
