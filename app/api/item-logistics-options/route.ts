import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, itemLogisticsOptions } from "@/db/schema";
import { apiRoute, RequestError } from "@/lib/api";
import { canAccessCompany, hasPermission, requireApiUser } from "@/lib/auth";

async function handle(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const input = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json();
  const companyId = Number(input.companyId);
  if (!canAccessCompany(user, companyId) || !hasPermission(user, request.method === "GET" ? "inventory:read" : "inventory:manage")) throw new RequestError("You cannot manage logistics choices for this company.", 403);
  const db = getDb();
  if (request.method === "GET") return Response.json({ options: await db.select().from(itemLogisticsOptions).where(eq(itemLogisticsOptions.companyId, companyId)).orderBy(asc(itemLogisticsOptions.value)) });
  const type = input.type;
  if (type !== "hs_code" && type !== "coo") throw new RequestError("Choose HS code or country of origin.");
  const value = typeof input.value === "string" ? input.value.trim().replace(/\s+/g, " ").toUpperCase() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!value || value.length > 80 || label.length > 100 || (type === "hs_code" && !/^\d{6,12}$/.test(value))) throw new RequestError("Enter a 6–12 digit HS code or a country name up to 80 characters; descriptions allow 100 characters.");
  const [option] = await db.insert(itemLogisticsOptions).values({ companyId, type, value, label }).onConflictDoNothing().returning();
  if (!option) throw new RequestError("This choice already exists.", 409);
  await db.insert(auditLog).values({ companyId, action: "created", entityType: "item_logistics_option", entityId: option.id, details: JSON.stringify({ type, value, actorId: user.id }) });
  return Response.json({ option }, { status: 201 });
}
export const GET = apiRoute(handle);
export const POST = apiRoute(handle, { transaction: true });
