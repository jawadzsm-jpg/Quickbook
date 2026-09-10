import { apiRoute } from "@/lib/api";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { companies, inventoryLocations, items } from "../../../db/schema";
import { requireApiUser } from "@/lib/auth";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load the inventory overview.";
}

async function handleGET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
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
      .where(and(eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, "active"), authorization.role === "all_admin" ? undefined : inArray(items.companyId, authorization.companyIds)))
      .orderBy(asc(items.category), asc(items.name), asc(companies.name), asc(inventoryLocations.name))
      .limit(5000);

    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export const GET = apiRoute(handleGET);
