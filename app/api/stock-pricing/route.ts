import { and, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { items, companies, auditLog } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";
import { failureResponse } from "@/lib/errors";

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only administrators can change stock prices." }, { status: 403 });
  try {
    const body = await readJsonBody(request, 10_000) as Record<string, unknown>;
    const price = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12;
    if (!Number.isInteger(body.itemId) || !Number.isInteger(body.companyId) || !price(body.salesPrice) || !price(body.expectedPrice) || (body.grnPrice !== null && !price(body.grnPrice)) || (body.expectedGrnPrice !== null && !price(body.expectedGrnPrice))) return Response.json({ error: "Enter valid non-negative prices." }, { status: 400 });
    const companyId = Number(body.companyId);
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "Company access denied." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [item] = await db.select().from(items).where(and(eq(items.id, Number(body.itemId)), eq(items.companyId, companyId))).for("update");
      const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.active, true)));
      if (!item || !company || item.status !== "active") return Response.json({ error: "Select an active item in this company." }, { status: 404 });
      if (item.salesPrice !== body.expectedPrice || item.grnPrice !== body.expectedGrnPrice) return Response.json({ error: "Prices changed. Reopen the report before saving." }, { status: 409 });
      const changes = { salesPrice: Number(body.salesPrice), grnPrice: body.grnPrice === null ? null : Number(body.grnPrice) };
      await db.update(items).set(changes).where(eq(items.id, item.id));
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item", entityId: item.id, details: JSON.stringify({ reason: "Stock pricing", userId: user.id, locationId: item.locationId, currency: company.baseCurrency, before: { salesPrice: item.salesPrice, grnPrice: item.grnPrice }, after: changes }) });
      return Response.json({ saved: true });
    });
  } catch (error) { return failureResponse(error, crypto.randomUUID(), "/api/stock-pricing"); }
}
