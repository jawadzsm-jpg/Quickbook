import { apiRoute } from "@/lib/api";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, items } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null;
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update item logistics.";
  return message.includes("does not exist") ? "The item-logistics database is being updated. Please refresh in a moment." : message;
}

async function handleGET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    const user = await requireCompanyAccess(request, companyId, "inventory:read");
    if (user instanceof Response) return user;
    if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory." }, { status: 400 });
    const records = await getDb().select({
      id: items.id,
      itemNumber: items.itemNumber,
      sku: items.sku,
      name: items.name,
      description: items.description,
      status: items.status,
      hsCode: items.hsCode,
      countryOfOrigin: items.countryOfOrigin,
      dimensionText: items.dimensionText,
      lengthCm: items.lengthCm,
      widthCm: items.widthCm,
      heightCm: items.heightCm,
      weightKg: items.weightKg,
    }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name));
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    const user = await requireCompanyAccess(request, companyId, "inventory:manage", true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(locationId) || locationId <= 0 || !Array.isArray(payload.records) || !payload.records.length || payload.records.length > 500) return Response.json({ error: "No valid item changes were provided." }, { status: 400 });
    const changes = payload.records.map((record) => record as Record<string, unknown>);
    const ids = [...new Set(changes.map((record) => Number(record.id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length !== changes.length) return Response.json({ error: "One or more item rows are invalid." }, { status: 400 });
    const db = getDb();
    const allowed = await db.select({ id: items.id }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, ids)));
    if (allowed.length !== ids.length) return Response.json({ error: "One or more items do not belong to this company inventory." }, { status: 403 });
    const prepared = changes.map((record) => {
      const numeric = [number(record.lengthCm), number(record.widthCm), number(record.heightCm), number(record.weightKg)];
      if (numeric.some((value) => value === null)) throw new Error("Enter valid non-negative dimensions and weights.");
      return { id: Number(record.id), hsCode: text(record.hsCode, 40), countryOfOrigin: text(record.countryOfOrigin, 80).toUpperCase(), dimensionText: text(record.dimensionText, 120), lengthCm: numeric[0]!, widthCm: numeric[1]!, heightCm: numeric[2]!, weightKg: numeric[3]! };
    });
    await Promise.all(prepared.map(({ id, ...values }) => db.update(items).set(values).where(and(eq(items.id, id), eq(items.companyId, companyId), eq(items.locationId, locationId)))));
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item_logistics", entityId: prepared[0].id, details: `${prepared.length} item logistics row(s) updated by ${user.email}` });
    return Response.json({ success: true, updated: prepared.length });
  } catch (error) {
    const message = errorMessage(error);
    return Response.json({ error: message }, { status: message.startsWith("Enter valid") ? 400 : 500 });
  }
}

export const GET = apiRoute(handleGET);

export const PATCH = apiRoute(handlePATCH, { transaction: true });
