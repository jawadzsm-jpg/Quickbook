import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { companies, inventoryLocations, items } from "../../../db/schema";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load the inventory overview.";
}

export async function GET() {
  try {
    const db = getDb();
    const records = await db.select({
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
      companyId: companies.id,
      companyName: companies.name,
      currency: companies.baseCurrency,
      locationId: inventoryLocations.id,
      locationName: inventoryLocations.name,
      locationCode: inventoryLocations.code,
    }).from(items)
      .innerJoin(companies, eq(items.companyId, companies.id))
      .innerJoin(inventoryLocations, eq(items.locationId, inventoryLocations.id))
      .where(and(eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, "active")))
      .orderBy(asc(items.category), asc(items.name), asc(companies.name), asc(inventoryLocations.name))
      .limit(5000);

    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
