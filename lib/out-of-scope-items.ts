import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { items, transactionLines, transactions } from "@/db/schema";
import { OUT_OF_SCOPE_CODE } from "./out-of-scope-rules";

/**
 * Items of the company that were bought outside the scope of VAT: their purchase VAT code is OUT_OF_SCOPE, or a
 * supplier bill that is not void, cancelled or draft used OUT_OF_SCOPE on a line for them.
 */
export async function outOfScopeItemIds(companyId: number, itemIds: readonly number[]) {
  const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Set<number>();
  const db = getDb();
  const [byDefault, byPurchase] = await Promise.all([
    db.select({ id: items.id }).from(items).where(and(eq(items.companyId, companyId), inArray(items.id, ids), eq(items.purchaseVatCode, OUT_OF_SCOPE_CODE))),
    db.selectDistinct({ id: transactionLines.itemId }).from(transactionLines).innerJoin(transactions, eq(transactions.id, transactionLines.transactionId)).where(and(
      eq(transactions.companyId, companyId), inArray(transactionLines.itemId, ids), inArray(transactions.type, ["bill", "received item bill"]),
      eq(transactionLines.vatCode, OUT_OF_SCOPE_CODE), sql`lower(${transactions.status}) NOT IN ('cancelled', 'canceled', 'void', 'voided', 'deleted', 'draft')`,
    )),
  ]);
  return new Set([...byDefault.map((row) => row.id), ...byPurchase.flatMap((row) => row.id ? [row.id] : [])].map(Number));
}
