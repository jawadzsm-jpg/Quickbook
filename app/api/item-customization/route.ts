import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, items } from "@/db/schema";
import { hasPermission, requireCompanyAccess } from "@/lib/auth";
import { skuWrite } from "@/lib/sku-locks";

type Specification = { label?: unknown; value?: unknown };

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown, max: number) => clean(value, max).toLocaleUpperCase("en");

function specifications(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Specification => Boolean(entry) && typeof entry === "object") : [];
  } catch { return []; }
}

function specificationValue(records: Specification[], labels: string[]) {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  const match = records.find((entry) => wanted.has(String(entry.label ?? "").trim().toLowerCase()));
  return clean(match?.value, 200);
}

function mergeSpecification(records: Specification[], label: string, value: string) {
  const index = records.findIndex((entry) => String(entry.label ?? "").trim().toLowerCase() === label.toLowerCase());
  const next = records.map((entry) => ({ label: clean(entry.label, 80), value: clean(entry.value, 300) }));
  if (index >= 0) next[index] = { label, value };
  else if (value) next.push({ label, value });
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const locationId = Number(url.searchParams.get("locationId"));
  const user = await requireCompanyAccess(request, companyId, "inventory:read");
  if (user instanceof Response) return user;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory." }, { status: 400 });
  const rows = await getDb().select({
    id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name, category: items.category,
    description: items.description, specifications: items.specifications, quantity: items.quantity, status: items.status,
    customizationRam: items.customizationRam, customizationStorage: items.customizationStorage, partNumber: items.partNumber,
    itemSerialNumber: items.itemSerialNumber, upcNumber: items.upcNumber, customizationDetails: items.customizationDetails,
  }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.category), asc(items.name));
  return Response.json({
    canEdit: hasPermission(user, "customization:manage"),
    records: rows.map((row) => {
      const specs = specifications(row.specifications);
      return {
        ...row,
        customizationRam: row.customizationRam || specificationValue(specs, ["RAM", "Memory"]),
        customizationStorage: row.customizationStorage || specificationValue(specs, ["Storage", "SSD", "Hard Drive"]),
        partNumber: row.partNumber || specificationValue(specs, ["Part Number", "MPN"]),
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePatch(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const locationId = Number(payload.locationId);
  const user = await requireCompanyAccess(request, companyId, "customization:manage", true);
  if (user instanceof Response) return user;
  if (!Number.isSafeInteger(locationId) || locationId <= 0 || !Array.isArray(payload.records) || !payload.records.length || payload.records.length > 250) return Response.json({ error: "Select 1–250 valid products to save." }, { status: 400 });
  const changes = payload.records.map((entry) => entry as Record<string, unknown>);
  const ids = [...new Set(changes.map((entry) => Number(entry.id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length !== changes.length) return Response.json({ error: "One or more product rows are invalid." }, { status: 400 });
  const db = getDb();
  const current = await db.select({ id: items.id, specifications: items.specifications }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, ids)));
  if (current.length !== ids.length) return Response.json({ error: "One or more products do not belong to this company inventory." }, { status: 403 });
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const prepared = changes.map((entry) => {
    const id = Number(entry.id);
    const customizationRam = upper(entry.customizationRam, 120);
    const customizationStorage = upper(entry.customizationStorage, 120);
    const partNumber = upper(entry.partNumber, 160);
    const itemSerialNumber = upper(entry.itemSerialNumber, 240);
    const upcNumber = upper(entry.upcNumber, 80);
    const customizationDetails = clean(entry.customizationDetails, 2000);
    let specs = specifications(byId.get(id)?.specifications ?? "[]");
    specs = mergeSpecification(specs, "RAM", customizationRam);
    specs = mergeSpecification(specs, "Storage", customizationStorage);
    specs = mergeSpecification(specs, "Part Number", partNumber);
    return { id, customizationRam, customizationStorage, partNumber, itemSerialNumber, upcNumber, customizationDetails, specifications: JSON.stringify(specs) };
  });
  await Promise.all(prepared.map(({ id, ...values }) => db.update(items).set(values).where(and(eq(items.id, id), eq(items.companyId, companyId), eq(items.locationId, locationId)))));
  await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item_customization", entityId: prepared[0].id, details: `${prepared.length} product customization row(s) updated by ${user.email}` });
  return Response.json({ success: true, updated: prepared.length });
}

export const PATCH = skuWrite("item-customization", handlePatch);
