import { and, asc, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { items, companies, auditLog, inventoryLocations } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";
import { failureResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const user = await requireApiUser(request, "inventory:read");
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only administrators can access stock pricing." }, { status: 403 });
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  if (!canAccessCompany(user, companyId)) return Response.json({ error: "Company access denied." }, { status: 403 });
  const records = await getDb().select({ id: items.id, name: items.name, sku: items.sku, itemNumber: items.itemNumber, description: items.description, quantity: items.quantity, grnPrice: items.grnPrice, grnCost: items.lastPurchasePrice, salesPrice: items.salesPrice, companyId: items.companyId, companyName: companies.name, homeCurrency: companies.baseCurrency, locationId: items.locationId, locationName: inventoryLocations.name }).from(items)
    .innerJoin(companies, eq(items.companyId, companies.id)).innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
    .where(and(eq(items.companyId, companyId), eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, "active"))).orderBy(asc(inventoryLocations.name), asc(items.name), asc(items.id));
  return Response.json({ records, canEdit: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only administrators can change stock prices." }, { status: 403 });
  try {
    const payload = await readJsonBody(request, 100_000) as Record<string, unknown>;
    const rows = (Array.isArray(payload.records) ? payload.records : [payload]) as Record<string, unknown>[];
    if (!rows.length || rows.length > 100 || new Set(rows.map((row) => row.itemId)).size !== rows.length) return Response.json({ error: "Select 1–100 unique items." }, { status: 400 });
    const price = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12;
    for (const body of rows) {
      if (!Number.isInteger(body.itemId) || !Number.isInteger(body.companyId) || !price(body.salesPrice) || !price(body.expectedPrice) || (body.grnPrice !== null && !price(body.grnPrice)) || (body.expectedGrnPrice !== null && !price(body.expectedGrnPrice))) return Response.json({ error: "Enter valid non-negative prices." }, { status: 400 });
      const companyId = Number(body.companyId);
      if (!canAccessCompany(user, companyId)) return Response.json({ error: "Company access denied." }, { status: 403 });
    }
    return await withWriteTransaction(async () => {
      const db = getDb();
      for (const body of [...rows].sort((a, b) => Number(a.itemId) - Number(b.itemId))) {
        const companyId = Number(body.companyId);
        const [item] = await db.select().from(items).where(and(eq(items.id, Number(body.itemId)), eq(items.companyId, companyId))).for("update");
        const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.active, true)));
        if (!item || !company || item.status !== "active") return Response.json({ error: "Select an active item in this company." }, { status: 404 });
        if (item.salesPrice !== body.expectedPrice || item.grnPrice !== body.expectedGrnPrice) return Response.json({ error: "Prices changed. Reopen the report before saving." }, { status: 409 });
        const changes = { salesPrice: Number(body.salesPrice), grnPrice: body.grnPrice === null ? null : Number(body.grnPrice) };
        await db.update(items).set(changes).where(eq(items.id, item.id));
        await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item", entityId: item.id, details: JSON.stringify({ reason: "Stock pricing", userId: user.id, locationId: item.locationId, currency: company.baseCurrency, before: { salesPrice: item.salesPrice, grnPrice: item.grnPrice }, after: changes }) });
      }
      return Response.json({ saved: rows.length });
    });
  } catch (error) { return failureResponse(error, crypto.randomUUID(), "/api/stock-pricing"); }
}
