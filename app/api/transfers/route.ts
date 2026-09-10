import { isIsoDate } from "@/lib/validation";
import { apiRoute } from "@/lib/api";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../db";
import { companies, contacts, inventoryLocations, items, stockTransfers } from "../../../db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

type TransferLine = { itemId?: unknown; sourceLocationId?: unknown; destinationLocationId?: unknown; quantity?: unknown };

async function handleGET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    if (new URL(request.url).searchParams.get("catalog") === "1") {
      const records = await db.select({ id: items.id, companyId: items.companyId, locationId: items.locationId, itemNumber: items.itemNumber, sku: items.sku, name: items.name, quantity: items.quantity }).from(items).where(and(gt(items.quantity, 0), authorization.role === "all_admin" ? undefined : inArray(items.companyId, authorization.companyIds)));
      const salesmen = await db.select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId }).from(contacts).where(and(eq(contacts.type, "employee"), authorization.role === "all_admin" ? undefined : inArray(contacts.companyId, authorization.companyIds)));
      return Response.json({ records, salesmen });
    }
    const sourceCompany = alias(companies, "source_company");
    const destinationCompany = alias(companies, "destination_company");
    const sourceLocation = alias(inventoryLocations, "source_location");
    const destinationLocation = alias(inventoryLocations, "destination_location");
    const records = await db.select({
      id: stockTransfers.id, reference: stockTransfers.reference, transferDate: stockTransfers.transferDate,
      itemNumber: stockTransfers.itemNumber, sku: stockTransfers.sku, itemName: stockTransfers.itemName,
      quantity: stockTransfers.quantity, salesman: stockTransfers.salesman, notes: stockTransfers.notes, sourceCompany: sourceCompany.name,
      sourceLocation: sourceLocation.name, destinationCompany: destinationCompany.name, destinationLocation: destinationLocation.name,
    }).from(stockTransfers)
      .innerJoin(sourceCompany, eq(stockTransfers.sourceCompanyId, sourceCompany.id))
      .innerJoin(sourceLocation, eq(stockTransfers.sourceLocationId, sourceLocation.id))
      .innerJoin(destinationCompany, eq(stockTransfers.destinationCompanyId, destinationCompany.id))
      .innerJoin(destinationLocation, eq(stockTransfers.destinationLocationId, destinationLocation.id))
      .where(authorization.role === "all_admin" ? undefined : and(inArray(stockTransfers.sourceCompanyId, authorization.companyIds), inArray(stockTransfers.destinationCompanyId, authorization.companyIds)))
      .orderBy(desc(stockTransfers.transferDate), desc(stockTransfers.id)).limit(500);
    return Response.json({ records });
  } catch (error) {
    throw error;
  }
}

async function handlePOST(request: Request) {
  const authorization = await requireApiUser(request, "inventory:transfer", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const rawLines = Array.isArray(payload.lines) ? payload.lines as TransferLine[] : [];
    const lines = rawLines.map((line, index) => ({
      lineIndex: index + 1, itemId: Number(line.itemId), sourceLocationId: Number(line.sourceLocationId),
      destinationLocationId: Number(line.destinationLocationId), quantity: Number(line.quantity),
    }));
    const transferDate = String(payload.transferDate ?? new Date().toISOString().slice(0, 10));
    const notes = String(payload.notes ?? "").trim();
    const salesman = String(payload.salesman ?? "").trim();
    const suppliedReference = String(payload.reference ?? "").trim().toUpperCase();
    const reference = suppliedReference || `TRF-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    if (!isIsoDate(transferDate)) return Response.json({ error: "Enter a valid transfer date." }, { status: 400 });
    if (!lines.length || lines.length > 100 || lines.some((line) => !Number.isInteger(line.itemId) || line.itemId <= 0 || !Number.isInteger(line.sourceLocationId) || line.sourceLocationId <= 0 || !Number.isInteger(line.destinationLocationId) || line.destinationLocationId <= 0 || line.sourceLocationId === line.destinationLocationId || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      return Response.json({ error: "Complete every transfer line with a product, different source and destination, and valid quantity." }, { status: 400 });
    }
    if (!/^[-A-Z0-9/]{2,40}$/.test(reference)) return Response.json({ error: "Enter a valid transfer reference." }, { status: 400 });

    const db = getDb();
    const locationIds = [...new Set(lines.flatMap((line) => [line.sourceLocationId, line.destinationLocationId]))];
    const locations = await db.select({ id: inventoryLocations.id, companyId: inventoryLocations.companyId }).from(inventoryLocations).where(inArray(inventoryLocations.id, locationIds));
    if (locations.length !== locationIds.length || locations.some((location) => !canAccessCompany(authorization, location.companyId))) return Response.json({ error: "You must have access to both transfer companies." }, { status: 403 });
    const result = await db.execute(sql`
      with input_lines as (
        select * from jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) as line("lineIndex" integer, "itemId" integer, "sourceLocationId" integer, "destinationLocationId" integer, "quantity" double precision)
      ), validated as (
        select line.*, source_location."company_id" as "sourceCompanyId", destination_location."company_id" as "destinationCompanyId",
          source_item."item_number" as "itemNumber", source_item."sku", source_item."name", source_item."category", source_item."description",
          source_item."specifications", source_item."reorder_point" as "reorderPoint", source_item."sales_price" as "salesPrice", source_item."cost",
          source_item."last_purchase_price" as "lastPurchasePrice", source_item."status"
        from input_lines line
        inner join "inventory_locations" source_location on source_location."id" = line."sourceLocationId" and source_location."active" = true
        inner join "inventory_locations" destination_location on destination_location."id" = line."destinationLocationId" and destination_location."active" = true
        inner join "items" source_item on source_item."id" = line."itemId" and source_item."location_id" = line."sourceLocationId" and source_item."company_id" = source_location."company_id"
      ), required_stock as (
        select "itemId", sum("quantity") as "quantity" from validated group by "itemId"
      ), ready as (
        select (select count(*) from input_lines) = (select count(*) from validated)
          and coalesce(bool_and(source_item."quantity" >= required_stock."quantity"), false) as "ok"
        from required_stock inner join "items" source_item on source_item."id" = required_stock."itemId"
      ), moved as (
        update "items" source_item set "quantity" = source_item."quantity" - required_stock."quantity"
        from required_stock, ready where ready."ok" and source_item."id" = required_stock."itemId"
        returning source_item."id"
      ), destination_totals as (
        select min(validated."itemId") as "itemId", validated."sku", validated."destinationCompanyId", validated."destinationLocationId", sum(validated."quantity") as "quantity"
        from validated inner join moved on moved."id" = validated."itemId"
        group by validated."sku", validated."destinationCompanyId", validated."destinationLocationId"
      ), received as (
        insert into "items" ("company_id", "location_id", "item_number", "sku", "name", "category", "description", "specifications", "quantity", "reorder_point", "sales_price", "cost", "last_purchase_price", "status")
        select destination_totals."destinationCompanyId", destination_totals."destinationLocationId", validated."itemNumber", validated."sku", validated."name", validated."category", validated."description", validated."specifications", destination_totals."quantity", validated."reorderPoint", validated."salesPrice", validated."cost", validated."lastPurchasePrice", validated."status"
        from destination_totals inner join validated on validated."itemId" = destination_totals."itemId"
        group by destination_totals."itemId", destination_totals."destinationCompanyId", destination_totals."destinationLocationId", destination_totals."quantity", validated."itemNumber", validated."sku", validated."name", validated."category", validated."description", validated."specifications", validated."reorderPoint", validated."salesPrice", validated."cost", validated."lastPurchasePrice", validated."status"
        on conflict ("company_id", "location_id", "sku") do update set
          "quantity" = "items"."quantity" + excluded."quantity", "name" = excluded."name", "category" = excluded."category",
          "description" = excluded."description", "specifications" = excluded."specifications", "sales_price" = excluded."sales_price", "cost" = excluded."cost", "last_purchase_price" = excluded."last_purchase_price"
        returning "id", "company_id", "location_id", "sku"
      ), logged as (
        insert into "stock_transfers" ("reference", "source_company_id", "source_location_id", "destination_company_id", "destination_location_id", "item_number", "sku", "item_name", "quantity", "transfer_date", "salesman", "notes")
        select ${reference}, validated."sourceCompanyId", validated."sourceLocationId", validated."destinationCompanyId", validated."destinationLocationId", validated."itemNumber", validated."sku", validated."name", validated."quantity", ${transferDate}, ${salesman}, ${notes}
        from validated inner join moved on moved."id" = validated."itemId"
        inner join received on received."company_id" = validated."destinationCompanyId" and received."location_id" = validated."destinationLocationId" and received."sku" = validated."sku"
        returning "id", "reference"
      )
      select * from logged order by "id"
    `);
    if (result.rows.length !== lines.length) return Response.json({ error: "The transfer was not saved. Check that every product is still available with enough quantity." }, { status: 409 });
    return Response.json({ transfer: { reference, lineCount: result.rows.length } }, { status: 201 });
  } catch (error) {
    throw error;
  }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });
