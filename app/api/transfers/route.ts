import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, withWriteTransaction } from "../../../db";
import { auditLog, companies, contacts, inventoryLocations, items, stockTransfers } from "../../../db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";

type TransferLine = { itemId?: unknown; sourceLocationId?: unknown; destinationLocationId?: unknown; quantity?: unknown };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not transfer inventory.";
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    if (new URL(request.url).searchParams.get("catalog") === "1") {
      const records = await db.select({ id: items.id, companyId: items.companyId, locationId: items.locationId, itemNumber: items.itemNumber, sku: items.sku, name: items.name, quantity: items.quantity }).from(items).where(gt(items.quantity, 0));
      const salesmen = await db.select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId }).from(contacts).where(eq(contacts.type, "employee"));
      return Response.json({ records, salesmen });
    }
    const sourceCompany = alias(companies, "source_company");
    const destinationCompany = alias(companies, "destination_company");
    const sourceLocation = alias(inventoryLocations, "source_location");
    const destinationLocation = alias(inventoryLocations, "destination_location");
    const records = await db.select({
      id: stockTransfers.id, reference: stockTransfers.reference, transferDate: stockTransfers.transferDate,
      sourceCompanyId: stockTransfers.sourceCompanyId, destinationCompanyId: stockTransfers.destinationCompanyId,
      itemNumber: stockTransfers.itemNumber, sku: stockTransfers.sku, itemName: stockTransfers.itemName,
      quantity: stockTransfers.quantity, salesman: stockTransfers.salesman, notes: stockTransfers.notes, sourceCompany: sourceCompany.name,
      sourceLocation: sourceLocation.name, destinationCompany: destinationCompany.name, destinationLocation: destinationLocation.name,
    }).from(stockTransfers)
      .innerJoin(sourceCompany, eq(stockTransfers.sourceCompanyId, sourceCompany.id))
      .innerJoin(sourceLocation, eq(stockTransfers.sourceLocationId, sourceLocation.id))
      .innerJoin(destinationCompany, eq(stockTransfers.destinationCompanyId, destinationCompany.id))
      .innerJoin(destinationLocation, eq(stockTransfers.destinationLocationId, destinationLocation.id))
      .orderBy(desc(stockTransfers.transferDate), desc(stockTransfers.id)).limit(500);
    return Response.json({ records: records.map((record) => ({ ...record, canEdit: isAdministrator(authorization) && canAccessCompany(authorization, record.sourceCompanyId) && canAccessCompany(authorization, record.destinationCompanyId) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// Edit one posted line without changing its product or inventory route.
export async function PATCH(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only Administrator and All-Admin users can edit transfers." }, { status: 403 });
  try {
    const payload = await readJsonBody(request, 20_000) as Record<string, unknown>;
    const id = Number(payload.id);
    const quantity = payload.quantity;
    const reference = String(payload.reference ?? "").trim().toUpperCase();
    const transferDate = String(payload.transferDate ?? "");
    const salesman = String(payload.salesman ?? "").trim();
    const notes = String(payload.notes ?? "").trim();
    const expected = payload.expected as Record<string, unknown> | undefined;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || !/^[-A-Z0-9/]{2,40}$/.test(reference) || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate) || !Number.isFinite(Date.parse(transferDate)) || new Date(transferDate).toISOString().slice(0, 10) !== transferDate || salesman.length > 200 || notes.length > 2000 || !expected) {
      return Response.json({ error: "Enter a valid quantity, reference and date, and reopen the transfer if necessary." }, { status: 400 });
    }
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [original] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id)).for("update");
      if (!original) return Response.json({ error: "Transfer not found." }, { status: 404 });
      if (!canAccessCompany(user, original.sourceCompanyId) || !canAccessCompany(user, original.destinationCompanyId)) return Response.json({ error: "You must have access to both companies to edit this transfer." }, { status: 403 });
      const fields = ["quantity", "reference", "transferDate", "salesman", "notes"] as const;
      if (fields.some((field) => original[field] !== expected[field])) return Response.json({ error: "This transfer changed while you were editing. Refresh and reopen it." }, { status: 409 });
      const delta = quantity - original.quantity;
      if (delta !== 0) {
        const stock = await db.select().from(items).where(and(eq(items.sku, original.sku), or(
          and(eq(items.companyId, original.sourceCompanyId), eq(items.locationId, original.sourceLocationId)),
          and(eq(items.companyId, original.destinationCompanyId), eq(items.locationId, original.destinationLocationId)),
        ))).orderBy(asc(items.id)).for("update");
        const source = stock.find((item) => item.companyId === original.sourceCompanyId && item.locationId === original.sourceLocationId);
        const destination = stock.find((item) => item.companyId === original.destinationCompanyId && item.locationId === original.destinationLocationId);
        if (!source || !destination || source.id === destination.id || source.itemNumber !== original.itemNumber || destination.itemNumber !== original.itemNumber || source.status !== "active" || destination.status !== "active") return Response.json({ error: "The original product is no longer available in both inventories. Quantity cannot be edited." }, { status: 409 });
        if (source.quantity - delta < 0 || destination.quantity + delta < 0) return Response.json({ error: "Not enough stock to make this correction. The source needs stock for an increase; the destination needs stock for a decrease." }, { status: 409 });
        await db.update(items).set({ quantity: sql`${items.quantity} - ${delta}` }).where(eq(items.id, source.id));
        await db.update(items).set({ quantity: sql`${items.quantity} + ${delta}` }).where(eq(items.id, destination.id));
      }
      const changes = { quantity, reference, transferDate, salesman, notes };
      await db.update(stockTransfers).set(changes).where(eq(stockTransfers.id, id));
      await db.insert(auditLog).values({ companyId: original.sourceCompanyId, action: "edited", entityType: "stock_transfer", entityId: id, details: JSON.stringify({ userId: user.id, before: original, after: { ...original, ...changes } }) });
      return Response.json({ saved: true });
    });
  } catch {
    return Response.json({ error: "Could not save the transfer edit. Refresh and try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only Administrator and All-Admin users can delete transfers." }, { status: 403 });
  try {
    const payload = await readJsonBody(request, 20_000) as Record<string, unknown>;
    const id = Number(payload.id);
    const expected = payload.expected as Record<string, unknown> | undefined;
    if (!Number.isSafeInteger(id) || id <= 0 || !expected || typeof expected !== "object" || Array.isArray(expected)) return Response.json({ error: "Select a transfer to delete." }, { status: 400 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [original] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id)).for("update");
      if (!original) return Response.json({ error: "Transfer not found. It may already have been deleted." }, { status: 404 });
      if (!canAccessCompany(user, original.sourceCompanyId) || !canAccessCompany(user, original.destinationCompanyId)) return Response.json({ error: "You must have access to both companies to delete this transfer." }, { status: 403 });
      const fields = ["quantity", "reference", "transferDate", "salesman", "notes"] as const;
      if (fields.some((field) => original[field] !== expected[field])) return Response.json({ error: "This transfer changed. Refresh and review it before deleting." }, { status: 409 });
      const stock = await db.select().from(items).where(and(eq(items.sku, original.sku), or(
        and(eq(items.companyId, original.sourceCompanyId), eq(items.locationId, original.sourceLocationId)),
        and(eq(items.companyId, original.destinationCompanyId), eq(items.locationId, original.destinationLocationId)),
      ))).orderBy(asc(items.id)).for("update");
      const source = stock.find((item) => item.companyId === original.sourceCompanyId && item.locationId === original.sourceLocationId);
      const destination = stock.find((item) => item.companyId === original.destinationCompanyId && item.locationId === original.destinationLocationId);
      if (!source || !destination || source.id === destination.id || source.itemNumber !== original.itemNumber || destination.itemNumber !== original.itemNumber || source.status !== "active" || destination.status !== "active") return Response.json({ error: "The original product is no longer available in both inventories. The transfer cannot be deleted safely." }, { status: 409 });
      if (!Number.isFinite(original.quantity) || original.quantity <= 0 || !Number.isFinite(source.quantity + original.quantity) || !Number.isFinite(destination.quantity) || destination.quantity < original.quantity) return Response.json({ error: "The destination does not have enough stock to reverse this transfer." }, { status: 409 });
      await db.update(items).set({ quantity: sql`${items.quantity} + ${original.quantity}` }).where(eq(items.id, source.id));
      await db.update(items).set({ quantity: sql`${items.quantity} - ${original.quantity}` }).where(eq(items.id, destination.id));
      await db.insert(auditLog).values({ companyId: original.sourceCompanyId, action: "deleted", entityType: "stock_transfer", entityId: id, details: JSON.stringify({ userId: user.id, before: original, stockReversed: true }) });
      await db.delete(stockTransfers).where(eq(stockTransfers.id, id));
      return Response.json({ deleted: true });
    });
  } catch {
    return Response.json({ error: "Could not delete the transfer. Refresh and try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    if (!lines.length || lines.length > 100 || lines.some((line) => !Number.isInteger(line.itemId) || line.itemId <= 0 || !Number.isInteger(line.sourceLocationId) || line.sourceLocationId <= 0 || !Number.isInteger(line.destinationLocationId) || line.destinationLocationId <= 0 || line.sourceLocationId === line.destinationLocationId || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      return Response.json({ error: "Complete every transfer line with a product, different source and destination, and valid quantity." }, { status: 400 });
    }
    if (!/^[-A-Z0-9/]{2,40}$/.test(reference)) return Response.json({ error: "Enter a valid transfer reference." }, { status: 400 });

    const db = getDb();
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
        inner join "items" source_item on source_item."id" = line."itemId" and source_item."location_id" = line."sourceLocationId"
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
        select validated."itemId", validated."destinationCompanyId", validated."destinationLocationId", sum(validated."quantity") as "quantity"
        from validated inner join moved on moved."id" = validated."itemId"
        group by validated."itemId", validated."destinationCompanyId", validated."destinationLocationId"
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
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
