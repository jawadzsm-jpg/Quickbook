import { and, gt, isNull, sql } from "drizzle-orm";
import { itemOffers } from "@/db/schema";

/** Offers that have not ended or been ended early: running now or scheduled to start. */
export function currentOfferCondition() {
  return and(isNull(itemOffers.endedAt), gt(itemOffers.endsAt, sql`now()`));
}
