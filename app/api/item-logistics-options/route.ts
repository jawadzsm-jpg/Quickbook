import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies, itemLogisticsOptions } from "@/db/schema";
import { apiRoute, RequestError } from "@/lib/api";
import { canAccessCompany, hasPermission, requireApiUser } from "@/lib/auth";
import { defaultLogisticsChoices, logisticsChoices, type LogisticsOption } from "@/lib/item-logistics";

async function handle(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const input = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json();
  const companyId = Number(input.companyId);
  if (!canAccessCompany(user, companyId) || !hasPermission(user, request.method === "GET" ? "inventory:read" : "inventory:manage")) throw new RequestError("You cannot manage logistics choices for this company.", 403);
  const db = getDb();
  if (request.method === "GET") return Response.json({ options: await db.select().from(itemLogisticsOptions).where(eq(itemLogisticsOptions.companyId, companyId)).orderBy(asc(itemLogisticsOptions.value)) });
  // Serialize catalog writes, including edits/deletes of defaults not yet stored.
  const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("update");
  if (!company) throw new RequestError("Company not found.", 404);
  const saved = await db.select().from(itemLogisticsOptions).where(eq(itemLogisticsOptions.companyId, companyId));
  let previous: LogisticsOption | undefined;
  if (request.method !== "POST") {
    if (input.id !== undefined) {
      const id = Number(input.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new RequestError("Choose a saved option.");
      previous = saved.find(option => option.id === id && !option.hidden) as LogisticsOption | undefined;
      if (!previous) throw new RequestError("Choice not found. Refresh the list.", 404);
      if ((input.expectedValue !== undefined && input.expectedValue !== previous.value) || (input.expectedLabel !== undefined && input.expectedLabel !== previous.label)) throw new RequestError("This choice changed. Refresh before trying again.", 409);
    } else {
      if (input.type !== "hs_code" && input.type !== "coo") throw new RequestError("Choose HS code or country of origin.");
      previous = defaultLogisticsChoices(input.type).find(option => option.sourceValue === input.sourceValue);
      if (!previous) throw new RequestError("Choice not found.", 404);
      if (saved.some(option => option.type === input.type && option.sourceValue === input.sourceValue)) throw new RequestError("This choice changed. Refresh before trying again.", 409);
    }
  }
  // Older catalogs may contain a saved choice equal to a built-in suggestion.
  const legacy = previous;
  if (legacy && !legacy.sourceValue && defaultLogisticsChoices(legacy.type).some(entry => entry.value === legacy.value) && !saved.some(entry => entry.type === legacy.type && entry.sourceValue === legacy.value)) {
    previous = { ...legacy, sourceValue: legacy.value };
  }
  const type = previous?.type ?? input.type;
  if (type !== "hs_code" && type !== "coo") throw new RequestError("Choose HS code or country of origin.");
  let option;
  if (request.method === "DELETE" && previous) {
    if (previous.sourceValue) {
      const values = { companyId, type, value: previous.value, label: previous.label, sourceValue: previous.sourceValue, hidden: true };
      [option] = previous.id
        ? await db.update(itemLogisticsOptions).set({ hidden: true, sourceValue: previous.sourceValue }).where(and(eq(itemLogisticsOptions.id, previous.id), eq(itemLogisticsOptions.companyId, companyId))).returning()
        : await db.insert(itemLogisticsOptions).values(values).returning();
    } else {
      [option] = await db.delete(itemLogisticsOptions).where(and(eq(itemLogisticsOptions.id, previous.id!), eq(itemLogisticsOptions.companyId, companyId))).returning();
    }
  } else {
    const value = typeof input.value === "string" ? input.value.trim().replace(/\s+/g, " ").toUpperCase() : "";
    const label = typeof input.label === "string" ? input.label.trim() : "";
    if (!value || value.length > 80 || label.length > 100 || (type === "hs_code" && !/^\d{6,12}$/.test(value))) throw new RequestError("Enter a 6–12 digit HS code or a country name up to 80 characters; descriptions allow 100 characters.");
    const duplicate = logisticsChoices(type, saved as LogisticsOption[]).some(entry => entry.value === value && !(previous && (previous.id ? entry.id === previous.id : entry.sourceValue === previous.sourceValue)));
    if (duplicate) throw new RequestError("This choice already exists.", 409);
    const values = { companyId, type, value, label, sourceValue: previous?.sourceValue ?? null, hidden: false };
    [option] = previous?.id
      ? await db.update(itemLogisticsOptions).set({ value, label, sourceValue: previous.sourceValue ?? null }).where(and(eq(itemLogisticsOptions.id, previous.id), eq(itemLogisticsOptions.companyId, companyId))).returning()
      : await db.insert(itemLogisticsOptions).values(values).returning();
  }
  const action = request.method === "DELETE" ? "deleted" : request.method === "PATCH" ? "updated" : "created";
  await db.insert(auditLog).values({ companyId, action, entityType: "item_logistics_option", entityId: option.id, details: JSON.stringify({ type, value: option.value, before: previous, actorId: user.id }) });
  return Response.json({ ok: true, option: request.method === "DELETE" && !option.sourceValue ? null : option }, { status: request.method === "POST" ? 201 : 200 });
}
export const GET = apiRoute(handle);
export const POST = apiRoute(handle, { transaction: true });
export const PATCH = apiRoute(handle, { transaction: true });
export const DELETE = apiRoute(handle, { transaction: true });
