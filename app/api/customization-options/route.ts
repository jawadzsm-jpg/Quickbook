import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { specificationOptions } from "@/db/schema";
import { apiRoute, RequestError } from "@/lib/api";
import { hasPermission, requireApiUser } from "@/lib/auth";
import { customizationOptionFields, customizationOptionScopes, type CustomizationOptionField, type CustomizationOptions } from "@/lib/customization-options";
import { normalizeComparableText, uppercaseText } from "@/lib/text-normalization";

// RAM, Storage and Screen Details upgrade options (shared by all companies). Every inventory reader lists them
// (Inventory Overview picks); Product Customization users add, rename and delete them.
async function handle(request: Request) {
  const reading = request.method === "GET";
  const user = await requireApiUser(request, reading ? "inventory:read" : "customization:manage", !reading);
  if (user instanceof Response) return user;
  const db = getDb();
  if (reading) {
    const rows = await db.select({ id: specificationOptions.id, label: specificationOptions.label, value: specificationOptions.value }).from(specificationOptions)
      .where(and(inArray(specificationOptions.label, Object.values(customizationOptionScopes)), eq(specificationOptions.active, true))).orderBy(asc(specificationOptions.value));
    const options = Object.fromEntries(customizationOptionFields.map((field) => [field, rows.filter((row) => row.label === customizationOptionScopes[field]).map(({ id, value }) => ({ id, value }))])) as CustomizationOptions;
    return Response.json({ options, canManage: hasPermission(user, "customization:manage") }, { headers: { "Cache-Control": "no-store" } });
  }
  const input = await request.json() as Record<string, unknown>;
  const field = String(input.field ?? "") as CustomizationOptionField;
  if (!customizationOptionFields.includes(field)) throw new RequestError("Choose RAM, Storage or Screen Details.");
  const scope = customizationOptionScopes[field];
  const saved = await db.select().from(specificationOptions).where(eq(specificationOptions.label, scope));
  const id = Number(input.id);
  const previous = request.method === "POST" ? undefined : saved.find((row) => row.id === id);
  if (request.method !== "POST" && !previous) throw new RequestError("Option not found. Refresh the list.", 404);
  if (request.method === "DELETE") {
    await db.delete(specificationOptions).where(and(eq(specificationOptions.id, previous!.id), eq(specificationOptions.label, scope)));
    return Response.json({ ok: true });
  }
  const value = uppercaseText(input.value).replace(/\s+/g, " ").slice(0, 120);
  if (!value) throw new RequestError("Enter the option text, e.g. 32GB RAM UPGRADE.");
  if (saved.some((row) => row.id !== previous?.id && normalizeComparableText(row.value) === normalizeComparableText(value))) throw new RequestError("This option already exists.", 409);
  const [row] = previous
    ? await db.update(specificationOptions).set({ value, active: true }).where(eq(specificationOptions.id, previous.id)).returning()
    : await db.insert(specificationOptions).values({ label: scope, value, active: true }).returning();
  return Response.json({ ok: true, option: { id: row.id, value: row.value } }, { status: previous ? 200 : 201 });
}

export const GET = apiRoute(handle);
export const POST = apiRoute(handle, { transaction: true });
export const PATCH = apiRoute(handle, { transaction: true });
export const DELETE = apiRoute(handle, { transaction: true });
