import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ITEM_IDLE_DAYS } from "@/lib/inactive-item-match";

type IdleItem = { id: number; companyId: number; sku: string; itemNumber: string | null; name: string; lastUsedAt: string };

/**
 * Makes active items inactive when nothing has used them for ITEM_IDLE_DAYS (90) days. "Used" means any of: the item was
 * created; it is on a document (any transaction type, by the document's entry time); a warehouse transfer, company
 * stock transfer, stock hold, Today Offer or inventory check; or an item audit entry (edit, price change, status change,
 * revaluation). items.updated_at is not used: bulk saves (customization, logistics) touch every row on the page.
 * Items are skipped while they have stock on hand (positive or negative), an unexpired hold, a running or scheduled
 * offer, or a line on an order that is still open. Each change is written to the audit log; reactivating an item
 * (item-status) logs a new entry, so it then gets a fresh 90 days.
 */
export async function inactivateIdleItems(now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - ITEM_IDLE_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  const result = await db.execute(sql`
    WITH idle AS (
      SELECT item.id
      FROM items item
      JOIN companies company ON company.id = item.company_id AND company.active = true
      WHERE item.status = 'active' AND abs(item.quantity) < 0.000001 AND item.created_at < ${cutoff}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM transaction_lines line JOIN transactions document ON document.id = line.transaction_id
          WHERE line.item_id = item.id AND (document.created_at >= ${cutoff}::timestamptz OR (
            document.type IN ('sales order', 'purchase order', 'pending invoice')
            AND lower(document.status) NOT IN ('closed', 'cancelled', 'canceled', 'void', 'voided', 'converted', 'invoiced', 'received', 'completed', 'paid')
          ))
        )
        AND NOT EXISTS (SELECT 1 FROM warehouse_transfers moved WHERE moved.item_id = item.id AND moved.created_at >= ${cutoff}::timestamptz)
        AND NOT EXISTS (
          SELECT 1 FROM stock_transfers moved WHERE moved.sku = item.sku AND moved.created_at >= ${cutoff}::timestamptz
            AND ((moved.source_company_id = item.company_id AND moved.source_location_id = item.location_id) OR (moved.destination_company_id = item.company_id AND moved.destination_location_id = item.location_id))
        )
        AND NOT EXISTS (SELECT 1 FROM stock_holds hold WHERE hold.item_id = item.id AND (hold.created_at >= ${cutoff}::timestamptz OR (hold.released_at IS NULL AND hold.expires_at > ${nowIso}::timestamptz)))
        AND NOT EXISTS (SELECT 1 FROM item_offers offer WHERE offer.item_id = item.id AND (offer.created_at >= ${cutoff}::timestamptz OR (offer.ended_at IS NULL AND offer.ends_at > ${nowIso}::timestamptz)))
        AND NOT EXISTS (
          SELECT 1 FROM inventory_check_lines check_line JOIN inventory_check_reports check_report ON check_report.id = check_line.report_id
          WHERE check_line.item_id = item.id AND check_report.updated_at >= ${cutoff}::timestamptz
        )
        AND NOT EXISTS (SELECT 1 FROM audit_log entry WHERE entry.entity_type = 'item' AND entry.entity_id = item.id AND entry.company_id = item.company_id AND entry.created_at >= ${cutoff}::timestamptz)
      FOR UPDATE OF item SKIP LOCKED
    ), changed AS (
      UPDATE items SET status = 'inactive'
      FROM idle WHERE items.id = idle.id AND items.status = 'active'
      RETURNING items.id, items.company_id, items.sku, items.item_number, items.name,
        greatest(items.created_at,
          (SELECT max(document.created_at) FROM transaction_lines line JOIN transactions document ON document.id = line.transaction_id WHERE line.item_id = items.id),
          (SELECT max(entry.created_at) FROM audit_log entry WHERE entry.entity_type = 'item' AND entry.entity_id = items.id AND entry.company_id = items.company_id)
        ) AS last_used_at
    ), logged AS (
      INSERT INTO audit_log (company_id, action, entity_type, entity_id, details)
      SELECT company_id, 'auto-inactivated', 'item', id, json_build_object(
        'mode', 'auto-inactivate', 'before', 'active', 'after', 'inactive', 'idleDays', ${ITEM_IDLE_DAYS}::integer, 'lastUsedAt', last_used_at,
        'sku', sku, 'itemNumber', item_number, 'name', name,
        'reason', ${`Not used in any document or stock movement for ${ITEM_IDLE_DAYS} days and no stock on hand.`}::text
      )::text FROM changed
      RETURNING entity_id
    )
    SELECT changed.id, changed.company_id AS "companyId", changed.sku, changed.item_number AS "itemNumber", changed.name, changed.last_used_at AS "lastUsedAt"
    FROM changed ORDER BY changed.company_id, changed.id
  `);
  const changed = result.rows as IdleItem[];
  return { inactivated: changed.length, items: changed };
}
