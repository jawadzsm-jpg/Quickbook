import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { items, salesInvoiceAllocations, transactionLines, transactions } from "@/db/schema";
import { averagePurchaseCosts, itemHomeCost } from "./item-cost";

export async function salesSourceLines(sourceId: number) {
  const db = getDb();
  const lines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, sourceId)).orderBy(asc(transactionLines.id));
  const allocations = lines.length ? await db.select().from(salesInvoiceAllocations).where(inArray(salesInvoiceAllocations.sourceLineId, lines.map((line) => line.id))) : [];
  return lines.map((line) => {
    const invoiced = allocations.filter((entry) => entry.sourceLineId === line.id).reduce((sum, entry) => sum + entry.quantity, 0);
    return { ...line, invoiced, remaining: Math.max(0, Math.round((line.quantity - invoiced) * 1e6) / 1e6) };
  });
}

export async function salesInventoryLines(sourceId: number, companyId: number, locationId: number) {
  const db = getDb();
  const lines = await salesSourceLines(sourceId);
  const ids = [...new Set(lines.flatMap((line) => line.itemId ? [line.itemId] : []))];
  const sourceItems = ids.length ? await db.select().from(items).where(and(eq(items.companyId, companyId), inArray(items.id, ids))) : [];
  const skus = [...new Set(sourceItems.map((item) => item.sku))];
  const destinationItems = skus.length ? await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.sku, skus))) : [];
  // Cost of sales uses what the stock was bought for, not the item's saved cost field.
  const averages = await averagePurchaseCosts(destinationItems.map((item) => item.id));
  return lines.map((line) => {
    const sourceItem = sourceItems.find((item) => item.id === line.itemId);
    const destinationItem = sourceItem ? destinationItems.find((item) => item.sku === sourceItem.sku) : undefined;
    return { ...line, stockItemId: destinationItem?.id ?? null, available: line.itemId ? Math.max(0, destinationItem?.quantity ?? 0) : line.remaining, homeCost: destinationItem ? itemHomeCost(destinationItem, averages) : 0 };
  });
}

export async function refreshSalesSource(sourceId: number) {
  const lines = await salesSourceLines(sourceId);
  const status = lines.length && lines.every((line) => line.remaining <= 0) ? "invoiced" : lines.some((line) => line.invoiced > 0) ? "partially invoiced" : "open";
  await getDb().update(transactions).set({ status }).where(eq(transactions.id, sourceId));
}
