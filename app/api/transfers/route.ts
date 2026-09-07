import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../db";
import { companies, inventoryLocations, stockTransfers } from "../../../db/schema";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not transfer inventory.";
}

export async function GET() {
  try {
    const db = getDb();
    const sourceCompany = alias(companies, "source_company");
    const destinationCompany = alias(companies, "destination_company");
    const sourceLocation = alias(inventoryLocations, "source_location");
    const destinationLocation = alias(inventoryLocations, "destination_location");
    const records = await db.select({
      id: stockTransfers.id,
      reference: stockTransfers.reference,
      transferDate: stockTransfers.transferDate,
      itemNumber: stockTransfers.itemNumber,
      sku: stockTransfers.sku,
      itemName: stockTransfers.itemName,
      quantity: stockTransfers.quantity,
      notes: stockTransfers.notes,
      sourceCompany: sourceCompany.name,
      sourceLocation: sourceLocation.name,
      destinationCompany: destinationCompany.name,
      destinationLocation: destinationLocation.name,
    }).from(stockTransfers)
      .innerJoin(sourceCompany, eq(stockTransfers.sourceCompanyId, sourceCompany.id))
      .innerJoin(sourceLocation, eq(stockTransfers.sourceLocationId, sourceLocation.id))
      .innerJoin(destinationCompany, eq(stockTransfers.destinationCompanyId, destinationCompany.id))
      .innerJoin(destinationLocation, eq(stockTransfers.destinationLocationId, destinationLocation.id))
      .orderBy(desc(stockTransfers.transferDate), desc(stockTransfers.id)).limit(250);
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const sourceCompanyId = Number(payload.sourceCompanyId);
    const sourceLocationId = Number(payload.sourceLocationId);
    const destinationCompanyId = Number(payload.destinationCompanyId);
    const destinationLocationId = Number(payload.destinationLocationId);
    const sourceItemId = Number(payload.itemId);
    const quantity = Number(payload.quantity);
    const transferDate = String(payload.transferDate ?? new Date().toISOString().slice(0, 10));
    const notes = String(payload.notes ?? "").trim();
    const suppliedReference = String(payload.reference ?? "").trim().toUpperCase();
    const reference = suppliedReference || `TRF-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    if (![sourceCompanyId, sourceLocationId, destinationCompanyId, destinationLocationId, sourceItemId].every((value) => Number.isInteger(value) && value > 0) || !Number.isFinite(quantity) || quantity <= 0) {
      return Response.json({ error: "Select the source, destination, item and a valid quantity." }, { status: 400 });
    }
    if (sourceCompanyId === destinationCompanyId && sourceLocationId === destinationLocationId) {
      return Response.json({ error: "Choose a different destination inventory." }, { status: 400 });
    }
    if (!/^[-A-Z0-9/]{2,40}$/.test(reference)) return Response.json({ error: "Enter a valid transfer reference." }, { status: 400 });

    const db = getDb();
    const [sourceLocation, destinationLocation] = await Promise.all([
      db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(sql`${inventoryLocations.id} = ${sourceLocationId} and ${inventoryLocations.companyId} = ${sourceCompanyId}`).limit(1),
      db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(sql`${inventoryLocations.id} = ${destinationLocationId} and ${inventoryLocations.companyId} = ${destinationCompanyId}`).limit(1),
    ]);
    if (!sourceLocation.length || !destinationLocation.length) return Response.json({ error: "The selected source or destination inventory was not found." }, { status: 404 });

    const result = await db.execute(sql`
      with moved as (
        update "items"
        set "quantity" = "quantity" - ${quantity}
        where "id" = ${sourceItemId}
          and "company_id" = ${sourceCompanyId}
          and "location_id" = ${sourceLocationId}
          and "quantity" >= ${quantity}
        returning *
      ), received as (
        insert into "items" ("company_id", "location_id", "item_number", "sku", "name", "category", "description", "specifications", "quantity", "reorder_point", "sales_price", "cost", "status")
        select ${destinationCompanyId}, ${destinationLocationId}, "item_number", "sku", "name", "category", "description", "specifications", ${quantity}, "reorder_point", "sales_price", "cost", "status"
        from moved
        on conflict ("company_id", "location_id", "sku") do update
        set "quantity" = "items"."quantity" + excluded."quantity",
            "name" = excluded."name",
            "category" = excluded."category",
            "description" = excluded."description",
            "specifications" = excluded."specifications",
            "sales_price" = excluded."sales_price",
            "cost" = excluded."cost"
        returning "id"
      ), logged as (
        insert into "stock_transfers" ("reference", "source_company_id", "source_location_id", "destination_company_id", "destination_location_id", "item_number", "sku", "item_name", "quantity", "transfer_date", "notes")
        select ${reference}, ${sourceCompanyId}, ${sourceLocationId}, ${destinationCompanyId}, ${destinationLocationId}, moved."item_number", moved."sku", moved."name", ${quantity}, ${transferDate}, ${notes}
        from moved cross join received
        returning "id", "reference"
      )
      select * from logged
    `);
    if (!result.rows.length) return Response.json({ error: "The source item does not have enough quantity for this transfer." }, { status: 409 });
    return Response.json({ transfer: result.rows[0] }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes("idx_stock_transfers_reference")) return Response.json({ error: "This transfer reference already exists." }, { status: 409 });
    return Response.json({ error: message }, { status: 500 });
  }
}
