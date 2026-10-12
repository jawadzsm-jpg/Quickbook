import { and, gt, isNull, sql } from "drizzle-orm";
import { itemOffers } from "@/db/schema";

/**
 * Quantity of the offer's item sold since the offer started: invoice and sales receipt lines (stock returns count back)
 * on documents created during the offer window that are not void.
 */
// Columns are written with the table name: inside the subquery an unqualified "item_id" would mean the sale line's own.
export const offerSoldQuantity = sql<number>`COALESCE((SELECT sum(tl.quantity) FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
  WHERE tl.item_id = "item_offers"."item_id" AND t.company_id = "item_offers"."company_id" AND t.type IN ('invoice', 'sales receipt')
    AND t.voided_at IS NULL AND lower(t.status) NOT IN ('void', 'voided', 'cancelled', 'canceled')
    AND t.created_at >= "item_offers"."starts_at" AND t.created_at < "item_offers"."ends_at"), 0)::float8`;

/** Offers that have not ended, been ended early or sold their offer quantity: running now or scheduled to start. */
export function currentOfferCondition() {
  return and(isNull(itemOffers.endedAt), gt(itemOffers.endsAt, sql`now()`), sql`(${itemOffers.offerQuantity} IS NULL OR ${offerSoldQuantity} < ${itemOffers.offerQuantity})`);
}
