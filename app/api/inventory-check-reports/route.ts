import { skuWrite } from "@/lib/sku-locks";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, auditLog, companies, inventoryCheckLines, inventoryCheckReports, inventoryLocations, items } from "@/db/schema";
import { requireCompanyAccess, type SessionUser } from "@/lib/auth";

type CompanyQuantity = { companyId: number; companyName: string; quantity: number; countedQuantity: number | null };
type StockOption = { itemId: number; itemNumber: string; sku: string; itemName: string; totalQuantity: number; companyQuantities: CompanyQuantity[] };

const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);
const skuKey = (value: unknown) => clean(value, 160).toUpperCase();

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update inventory check reports.";
  return message.includes("does not exist") ? "The inventory-check database is being updated. Please refresh in a moment." : message;
}

async function reportForCompany(id: number, companyId: number) {
  const [record] = await getDb().select().from(inventoryCheckReports)
    .where(and(eq(inventoryCheckReports.id, id), eq(inventoryCheckReports.companyId, companyId))).limit(1);
  return record;
}

async function availableStock(user: SessionUser): Promise<{ companies: Array<{ id: number; name: string }>; items: StockOption[] }> {
  const db = getDb();
  const companyRows = user.role === "all_admin"
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name))
    : user.companyIds.length
      ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.active, true), inArray(companies.id, user.companyIds))).orderBy(asc(companies.name))
      : [];
  if (!companyRows.length) return { companies: [], items: [] };
  const stockRows = await db.select({
    itemId: items.id,
    companyId: items.companyId,
    itemNumber: items.itemNumber,
    sku: items.sku,
    itemName: items.name,
    quantity: items.quantity,
  }).from(items).where(and(inArray(items.companyId, companyRows.map((company) => company.id)), eq(items.status, "active"))).orderBy(asc(items.name));
  const bySku = new Map<string, StockOption>();
  for (const row of stockRows) {
    const key = skuKey(row.sku);
    if (!key) continue;
    let option = bySku.get(key);
    if (!option) {
      option = {
        itemId: row.itemId,
        itemNumber: row.itemNumber ?? "",
        sku: row.sku,
        itemName: row.itemName,
        totalQuantity: 0,
        companyQuantities: companyRows.map((company) => ({ companyId: company.id, companyName: company.name, quantity: 0, countedQuantity: null })),
      };
      bySku.set(key, option);
    }
    const companyQuantity = option.companyQuantities.find((entry) => entry.companyId === row.companyId);
    if (companyQuantity) companyQuantity.quantity += Number(row.quantity);
    option.totalQuantity += Number(row.quantity);
  }
  return { companies: companyRows, items: [...bySku.values()].filter((item) => item.totalQuantity > 0).sort((a, b) => a.itemName.localeCompare(b.itemName) || a.sku.localeCompare(b.sku)) };
}

function parsedQuantities(value: string, fallback?: CompanyQuantity): CompanyQuantity[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const quantities = parsed.filter((entry): entry is CompanyQuantity => Boolean(entry) && typeof entry === "object" && Number.isInteger(Number((entry as CompanyQuantity).companyId))).map((entry) => {
        const raw = (entry as { countedQuantity?: unknown }).countedQuantity;
        const counted = raw === null || raw === undefined || raw === "" ? null : Number(raw);
        return { companyId: Number(entry.companyId), companyName: clean(entry.companyName, 160), quantity: Number(entry.quantity) || 0, countedQuantity: counted !== null && Number.isFinite(counted) ? counted : null };
      });
      return quantities.length ? quantities : fallback ? [fallback] : [];
    }
  } catch { /* Older report rows use the fallback below. */ }
  return fallback ? [fallback] : [];
}

function quantitiesWithCounts(values: CompanyQuantity[], counts: unknown): CompanyQuantity[] {
  const input = counts && typeof counts === "object" ? counts as Record<string, unknown> : {};
  return values.map((entry) => {
    const raw = input[String(entry.companyId)];
    if (raw === "" || raw === null || raw === undefined) return { ...entry, countedQuantity: null };
    const countedQuantity = Number(raw);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0 || countedQuantity > 1_000_000_000) throw new Error("Enter a valid checked quantity.");
    return { ...entry, countedQuantity };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    const reportId = Number(url.searchParams.get("reportId"));
    const user = await requireCompanyAccess(request, companyId, "inventory:read");
    if (user instanceof Response) return user;
    const db = getDb();
    if (url.searchParams.get("options") === "1") return Response.json(await availableStock(user));
    if (Number.isInteger(reportId) && reportId > 0) {
      const record = await reportForCompany(reportId, companyId);
      if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
      const [ownerCompany] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, record.companyId)).limit(1);
      const stored = await db.select().from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, reportId)).orderBy(asc(inventoryCheckLines.itemName));
      const lines = stored.map((line) => ({ ...line, companyQuantities: parsedQuantities(line.companyQuantities, ownerCompany ? { companyId: ownerCompany.id, companyName: ownerCompany.name, quantity: Number(line.systemQuantity), countedQuantity: line.countedQuantity } : undefined) }));
      const companyMap = new Map<number, { id: number; name: string }>();
      for (const line of lines) for (const company of line.companyQuantities) companyMap.set(company.companyId, { id: company.companyId, name: company.companyName });
      return Response.json({ record, lines, companies: [...companyMap.values()] });
    }
    const conditions = [eq(inventoryCheckReports.companyId, companyId)];
    if (Number.isInteger(locationId) && locationId > 0) conditions.push(eq(inventoryCheckReports.locationId, locationId));
    const records = await db.select({
      id: inventoryCheckReports.id, companyId: inventoryCheckReports.companyId, locationId: inventoryCheckReports.locationId,
      memo: inventoryCheckReports.memo, createdAt: inventoryCheckReports.createdAt, updatedAt: inventoryCheckReports.updatedAt,
      creator: appUsers.fullName, creatorEmail: appUsers.email, locationName: inventoryLocations.name,
    }).from(inventoryCheckReports)
      .leftJoin(appUsers, eq(inventoryCheckReports.createdByUserId, appUsers.id))
      .innerJoin(inventoryLocations, eq(inventoryCheckReports.locationId, inventoryLocations.id))
      .where(and(...conditions)).orderBy(desc(inventoryCheckReports.createdAt));
    const reportIds = records.map((record) => record.id);
    const summaryLines = reportIds.length ? await db.select({ reportId: inventoryCheckLines.reportId, itemNumber: inventoryCheckLines.itemNumber, systemQuantity: inventoryCheckLines.systemQuantity, companyQuantities: inventoryCheckLines.companyQuantities, remark: inventoryCheckLines.remark }).from(inventoryCheckLines).where(inArray(inventoryCheckLines.reportId, reportIds)) : [];
    const summaries = new Map<number, { itemCount: number; totalQuantity: number; checkedCount: number; expectedCheckCount: number; mismatchedCount: number; itemNumbers: string[]; remarks: string[] }>();
    for (const line of summaryLines) {
      const summary = summaries.get(line.reportId) ?? { itemCount: 0, totalQuantity: 0, checkedCount: 0, expectedCheckCount: 0, mismatchedCount: 0, itemNumbers: [], remarks: [] };
      const quantities = parsedQuantities(line.companyQuantities);
      const relevantQuantities = quantities.filter((company) => company.quantity > 0.000001 || company.countedQuantity !== null);
      summary.itemCount += 1;
      summary.totalQuantity += Number(line.systemQuantity);
      summary.expectedCheckCount += relevantQuantities.length;
      for (const company of relevantQuantities) if (company.countedQuantity !== null) {
        summary.checkedCount += 1;
        if (Math.abs(company.countedQuantity - company.quantity) > 0.000001) summary.mismatchedCount += 1;
      }
      if (line.itemNumber && !summary.itemNumbers.includes(line.itemNumber)) summary.itemNumbers.push(line.itemNumber);
      if (line.remark && !summary.remarks.includes(line.remark)) summary.remarks.push(line.remark);
      summaries.set(line.reportId, summary);
    }
    return Response.json({ records: records.map((record) => { const summary = summaries.get(record.id) ?? { itemCount: 0, totalQuantity: 0, checkedCount: 0, expectedCheckCount: 0, mismatchedCount: 0, itemNumbers: [], remarks: [] }; return { ...record, ...summary, itemIdSummary: summary.itemNumbers.map((value) => `#${value}`).join(", "), remarkSummary: summary.remarks.join("; ").slice(0, 240) }; }) });
  } catch (error) { return Response.json({ error: databaseError(error) }, { status: 500 }); }
}

async function handlePOST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    const memo = clean(payload.memo);
    const requestedLines = Array.isArray(payload.lines) ? payload.lines.slice(0, 2_000) as Array<Record<string, unknown>> : [];
    const user = await requireCompanyAccess(request, companyId, "inventory:read", true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory." }, { status: 400 });
    if (!requestedLines.length) return Response.json({ error: "Select at least one in-stock item." }, { status: 400 });
    const db = getDb();
    const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
      .where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
    if (!location) return Response.json({ error: "Inventory not found for this company." }, { status: 404 });
    const stock = await availableStock(user);
    const available = new Map(stock.items.map((item) => [skuKey(item.sku), item]));
    const selected = new Map<string, { option: StockOption; remark: string; counts: unknown }>();
    for (const line of requestedLines) {
      const key = skuKey(line.sku);
      const option = available.get(key);
      if (option) selected.set(key, { option, remark: clean(line.remark, 500), counts: line.counts });
    }
    if (!selected.size) return Response.json({ error: "The selected items are no longer in stock." }, { status: 409 });
    const [record] = await db.insert(inventoryCheckReports).values({ companyId, locationId, memo, createdByUserId: user.id }).returning();
    await db.insert(inventoryCheckLines).values([...selected.values()].map(({ option, remark, counts }) => ({
      reportId: record.id, itemId: option.itemId, itemNumber: option.itemNumber, sku: option.sku, itemName: option.itemName,
      systemQuantity: option.totalQuantity, companyQuantities: JSON.stringify(quantitiesWithCounts(option.companyQuantities, counts)), remark,
    })));
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "inventory_check_report", entityId: record.id, details: `Inventory check report #${record.id} created with ${selected.size} selected item(s) by ${user.email}` });
    return Response.json({ record }, { status: 201 });
  } catch (error) { return Response.json({ error: databaseError(error) }, { status: 500 }); }
}

async function handlePATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    const memo = clean(payload.memo);
    const requestedLines = Array.isArray(payload.lines) ? payload.lines.slice(0, 2_000) as Array<Record<string, unknown>> : [];
    const user = await requireCompanyAccess(request, companyId, true, true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(id) || id <= 0 || !requestedLines.length) return Response.json({ error: "Select at least one item for the inventory check report." }, { status: 400 });
    const record = await reportForCompany(id, companyId);
    if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
    const db = getDb();
    const current = await db.select().from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, id));
    const byId = new Map(current.map((line) => [line.id, line]));
    const seenSkus = new Set<string>();
    const keepIds = new Set<number>();
    const [ownerCompany] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, record.companyId)).limit(1);
    const additions: Array<{ sku: string; remark: string; counts: unknown }> = [];
    for (const line of requestedLines) {
      const existing = byId.get(Number(line.id));
      const key = skuKey(existing?.sku ?? line.sku);
      if (!key || seenSkus.has(key)) continue;
      seenSkus.add(key);
      if (existing) {
        keepIds.add(existing.id);
        const quantities = parsedQuantities(existing.companyQuantities, ownerCompany ? { companyId: ownerCompany.id, companyName: ownerCompany.name, quantity: Number(existing.systemQuantity), countedQuantity: existing.countedQuantity } : undefined);
        await db.update(inventoryCheckLines).set({ remark: clean(line.remark, 500), companyQuantities: JSON.stringify(quantitiesWithCounts(quantities, line.counts)) }).where(and(eq(inventoryCheckLines.id, existing.id), eq(inventoryCheckLines.reportId, id)));
      } else additions.push({ sku: key, remark: clean(line.remark, 500), counts: line.counts });
    }
    for (const line of current) if (!keepIds.has(line.id)) await db.delete(inventoryCheckLines).where(and(eq(inventoryCheckLines.id, line.id), eq(inventoryCheckLines.reportId, id)));
    if (additions.length) {
      const stock = await availableStock(user);
      const available = new Map(stock.items.map((item) => [skuKey(item.sku), item]));
      const rows = additions.map((line) => ({ line, option: available.get(line.sku) })).filter((entry): entry is { line: { sku: string; remark: string; counts: unknown }; option: StockOption } => Boolean(entry.option));
      if (rows.length !== additions.length) throw new Error("One or more selected items are no longer in stock. Refresh the report and try again.");
      if (rows.length) await db.insert(inventoryCheckLines).values(rows.map(({ line, option }) => ({ reportId: id, itemId: option.itemId, itemNumber: option.itemNumber, sku: option.sku, itemName: option.itemName, systemQuantity: option.totalQuantity, companyQuantities: JSON.stringify(quantitiesWithCounts(option.companyQuantities, line.counts)), remark: line.remark })));
    }
    const remaining = await db.select({ id: inventoryCheckLines.id }).from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, id)).limit(1);
    if (!remaining.length) throw new Error("At least one in-stock item must remain on the report.");
    const [saved] = await db.update(inventoryCheckReports).set({ memo, updatedAt: new Date().toISOString() }).where(eq(inventoryCheckReports.id, id)).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "inventory_check_report", entityId: id, details: `Inventory check report #${id} updated by administrator ${user.email}` });
    return Response.json({ record: saved });
  } catch (error) { return Response.json({ error: databaseError(error) }, { status: 500 }); }
}

async function handleDELETE(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    const user = await requireCompanyAccess(request, companyId, true, true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid inventory check report." }, { status: 400 });
    const db = getDb();
    const [record] = await db.delete(inventoryCheckReports).where(and(eq(inventoryCheckReports.id, id), eq(inventoryCheckReports.companyId, companyId))).returning();
    if (!record) return Response.json({ error: "Inventory check report not found." }, { status: 404 });
    await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "inventory_check_report", entityId: id, details: `Inventory check report #${id} deleted by administrator ${user.email}` });
    return Response.json({ success: true });
  } catch (error) { return Response.json({ error: databaseError(error) }, { status: 500 }); }
}

export const POST = skuWrite("inventory-check-reports", handlePOST);
export const PATCH = skuWrite("inventory-check-reports", handlePATCH);
export const DELETE = skuWrite("inventory-check-reports", handleDELETE);
