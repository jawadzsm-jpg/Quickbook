import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { companies, inventoryLocations, items } from "../../../db/schema";
import { isAdministrator, requireApiUser } from "@/lib/auth";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load the inventory overview.";
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    const recordsPromise = db.select({
      id: items.id,
      itemNumber: items.itemNumber,
      sku: items.sku,
      name: items.name,
      category: items.category,
      description: items.description,
      specifications: items.specifications,
      quantity: items.quantity,
      reorderPoint: items.reorderPoint,
      salesPrice: items.salesPrice,
      status: items.status,
      createdAt: items.createdAt,
      customizationRam: items.customizationRam,
      customizationStorage: items.customizationStorage,
      partNumber: items.partNumber,
      itemSerialNumber: items.itemSerialNumber,
      upcNumber: items.upcNumber,
      customizationDetails: items.customizationDetails,
      latestReceivedAt: sql<string | null>`COALESCE((
        SELECT MAX(receipt.created_at)
        FROM inventory_movements movement
        JOIN transactions receipt ON receipt.id = movement.transaction_id
        WHERE movement.item_id = ${items.id}
          AND movement.quantity > 0
          AND receipt.status <> 'cancelled'
      ), ${items.createdAt})`,
      companyId: companies.id,
      companyName: companies.name,
      currency: companies.baseCurrency,
      locationId: inventoryLocations.id,
      locationName: inventoryLocations.name,
      locationCode: inventoryLocations.code,
    }).from(items)
      .innerJoin(companies, eq(items.companyId, companies.id))
      .innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
      .where(and(eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, "active"), authorization.role === "all_admin" ? undefined : inArray(items.companyId, authorization.companyIds)))
      .orderBy(asc(items.category), asc(items.name), asc(companies.name), asc(inventoryLocations.name))
      .limit(5000);

    const companyScope = authorization.role === "all_admin"
      ? sql``
      : authorization.companyIds.length
        ? sql`AND activity_company.id IN (${sql.join(authorization.companyIds.map((id) => sql`${id}`), sql`, `)})`
        : sql`AND false`;

    const [records, incomingResult, launchedResult, priceResult, soldResult] = await Promise.all([
      recordsPromise,
      db.execute(sql`
        SELECT po_line.id, po_line.item_id AS "itemId", purchase_order.id AS "transactionId",
          purchase_order.transaction_date AS date, purchase_order.number AS "documentNumber",
          purchase_order.party, purchase_order.salesman AS "salesRep",
          purchase_order.type AS "documentType", purchase_order.status AS "documentStatus",
          linked_bill.id AS "linkedBillId", linked_bill.number AS "linkedBillNumber",
          stock_item.sku, stock_item.item_number AS "itemNumber", stock_item.name AS "itemName",
          activity_company.id AS "companyId", inventory_location.id AS "locationId",
          activity_company.name AS "companyName", inventory_location.name AS "locationName",
          activity_company.base_currency AS currency,
          GREATEST(po_line.quantity - COALESCE(SUM(receipt.quantity), 0), 0)::double precision AS quantity,
          po_line.unit_price::double precision AS price
        FROM transaction_lines po_line
        JOIN transactions purchase_order ON purchase_order.id = po_line.transaction_id
        JOIN items stock_item ON stock_item.id = po_line.item_id AND stock_item.company_id = purchase_order.company_id
        JOIN companies activity_company ON activity_company.id = purchase_order.company_id
        LEFT JOIN inventory_locations inventory_location ON inventory_location.id = purchase_order.location_id AND inventory_location.company_id = purchase_order.company_id
        LEFT JOIN purchase_receipt_allocations receipt ON receipt.order_line_id = po_line.id
        LEFT JOIN LATERAL (
          SELECT receipt_document.id, receipt_document.number
          FROM purchase_receipt_allocations bill_allocation
          JOIN transactions receipt_document ON receipt_document.id = bill_allocation.receipt_id
          WHERE bill_allocation.order_line_id = po_line.id
            AND receipt_document.type = 'bill' AND receipt_document.status <> 'cancelled'
          ORDER BY receipt_document.id DESC
          LIMIT 1
        ) linked_bill ON true
        WHERE purchase_order.type = 'purchase order'
          AND purchase_order.status IN ('open', 'pending', 'overdue', 'partially received')
          AND activity_company.active = true ${companyScope}
        GROUP BY po_line.id, purchase_order.id, stock_item.id, activity_company.id, inventory_location.id, linked_bill.id, linked_bill.number
        HAVING po_line.quantity > COALESCE(SUM(receipt.quantity), 0)
        ORDER BY purchase_order.transaction_date DESC, purchase_order.id DESC, po_line.id DESC
        LIMIT 50
      `),
      db.execute(sql`
        SELECT bill_line.id, stock_item.id AS "itemId", bill.id AS "transactionId",
          bill.created_at AS date, bill.number AS "documentNumber", bill.party, bill.salesman AS "salesRep",
          stock_item.sku, stock_item.item_number AS "itemNumber", stock_item.name AS "itemName",
          activity_company.id AS "companyId", inventory_location.id AS "locationId",
          activity_company.name AS "companyName", inventory_location.name AS "locationName",
          bill.currency, bill_line.quantity::double precision AS quantity,
          bill_line.unit_price::double precision AS price
        FROM transaction_lines bill_line
        JOIN transactions bill ON bill.id = bill_line.transaction_id
        JOIN items stock_item ON stock_item.id = bill_line.item_id AND stock_item.company_id = bill.company_id
        JOIN companies activity_company ON activity_company.id = bill.company_id
        JOIN inventory_locations inventory_location ON inventory_location.id = bill.location_id AND inventory_location.company_id = bill.company_id
        WHERE bill.type = 'bill' AND bill.status <> 'cancelled' AND bill_line.quantity > 0
          AND bill.created_at > now() - interval '12 hours' AND bill.created_at <= now()
          AND EXISTS (SELECT 1 FROM inventory_movements movement
            WHERE movement.transaction_id = bill.id AND movement.item_id = stock_item.id
              AND movement.movement_type = 'bill' AND movement.quantity > 0)
          AND stock_item.status = 'active' AND activity_company.active = true
          AND inventory_location.active = true ${companyScope}
        ORDER BY bill.created_at DESC, bill.id DESC, bill_line.id DESC
      `),
      db.execute(sql`
        SELECT activity_log.id, stock_item.id AS "itemId", NULL::integer AS "transactionId",
          activity_log.created_at AS date, ''::text AS "documentNumber", ''::text AS party, ''::text AS "salesRep",
          stock_item.sku, stock_item.item_number AS "itemNumber", stock_item.name AS "itemName",
          activity_company.id AS "companyId", inventory_location.id AS "locationId",
          activity_company.name AS "companyName", inventory_location.name AS "locationName",
          activity_company.base_currency AS currency, stock_item.quantity::double precision AS quantity,
          stock_item.sales_price::double precision AS price, activity_log.details
        FROM audit_log activity_log
        JOIN items stock_item ON stock_item.id = activity_log.entity_id AND stock_item.company_id = activity_log.company_id
        JOIN companies activity_company ON activity_company.id = activity_log.company_id
        JOIN inventory_locations inventory_location ON inventory_location.id = stock_item.location_id AND inventory_location.company_id = stock_item.company_id
        WHERE activity_log.entity_type = 'item'
          AND activity_log.created_at > now() - interval '12 hours' AND activity_log.created_at <= now()
          AND (activity_log.details LIKE '%salesPrice%' OR activity_log.details LIKE '%oldPrice%' OR activity_log.details LIKE '%newPrice%')
          AND activity_company.active = true ${companyScope}
        ORDER BY activity_log.created_at DESC, activity_log.id DESC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT sale_line.id, sale_line.item_id AS "itemId", sale.id AS "transactionId",
          sale.transaction_date AS date, sale.number AS "documentNumber", sale.party, sale.salesman AS "salesRep",
          stock_item.sku, stock_item.item_number AS "itemNumber", stock_item.name AS "itemName",
          activity_company.id AS "companyId", inventory_location.id AS "locationId",
          activity_company.name AS "companyName", inventory_location.name AS "locationName",
          sale.currency, sale_line.quantity::double precision AS quantity,
          sale_line.unit_price::double precision AS price
        FROM transaction_lines sale_line
        JOIN transactions sale ON sale.id = sale_line.transaction_id
        JOIN items stock_item ON stock_item.id = sale_line.item_id AND stock_item.company_id = sale.company_id
        JOIN companies activity_company ON activity_company.id = sale.company_id
        LEFT JOIN inventory_locations inventory_location ON inventory_location.id = sale.location_id AND inventory_location.company_id = sale.company_id
        WHERE sale.type IN ('invoice', 'sales receipt') AND sale.status <> 'cancelled'
          AND activity_company.active = true ${companyScope}
        ORDER BY sale.transaction_date DESC, sale.id DESC, sale_line.id DESC
        LIMIT 50
      `),
    ]);

    const priceChangeItemIds = new Set<number>();
    const priceChanges = priceResult.rows.flatMap((row) => {
      try {
        const detail = JSON.parse(String(row.details ?? "")) as { before?: { salesPrice?: number }; after?: { salesPrice?: number }; oldPrice?: number; newPrice?: number };
        const previousPrice = Number(detail.before?.salesPrice ?? detail.oldPrice);
        const currentPrice = Number(detail.after?.salesPrice ?? detail.newPrice);
        const itemId = Number(row.itemId);
        if (!Number.isFinite(previousPrice) || !Number.isFinite(currentPrice) || previousPrice === currentPrice || priceChangeItemIds.has(itemId)) return [];
        priceChangeItemIds.add(itemId);
        return [{ ...row, previousPrice, currentPrice, details: undefined }];
      } catch { return []; }
    }).slice(0, 50);

    return Response.json({
      records,
      canSelectItems: isAdministrator(authorization),
      activity: { incoming: incomingResult.rows, launched: launchedResult.rows, priceChanges, sold: soldResult.rows },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
