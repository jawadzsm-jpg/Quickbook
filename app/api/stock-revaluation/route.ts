import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { accounts, auditLog, companies, inventoryLocations, items, journalEntries, journalLines } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";

export async function GET(request: Request) {
  const user = await requireApiUser(request, "inventory:read");
  if (user instanceof Response) return user;
  const records = await getDb().select({ id: items.id, name: items.name, sku: items.sku, itemNumber: items.itemNumber, description: items.description, specifications: items.specifications, quantity: items.quantity, cost: items.cost, grnCost: items.lastPurchasePrice, salesPrice: items.salesPrice, companyId: items.companyId, companyName: companies.name, homeCurrency: companies.baseCurrency, locationId: items.locationId, locationName: inventoryLocations.name }).from(items)
    .innerJoin(companies, eq(items.companyId, companies.id)).innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
    .where(and(eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, "active"), user.role === "all_admin" ? undefined : inArray(items.companyId, user.companyIds)))
    .orderBy(asc(companies.name), asc(inventoryLocations.name), asc(items.name));
  return Response.json({ records, canEdit: isAdministrator(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only administrators can revalue stock." }, { status: 403 });
  try {
    const payload = await readJsonBody(request, 200_000) as { records?: Array<Record<string, unknown>> };
    const changes = payload.records;
    if (!changes?.length || changes.length > 100 || new Set(changes.map((r) => r.id)).size !== changes.length) return Response.json({ error: "Select 1–100 unique items." }, { status: 400 });
    for (const row of changes) if (!Number.isInteger(row.id) || Number(row.id) <= 0 || [row.cost, row.salesPrice, row.expectedCost, row.expectedPrice, row.expectedQuantity].some((v) => typeof v !== "number" || !Number.isFinite(v)) || Number(row.cost) < 0 || Number(row.salesPrice) < 0) return Response.json({ error: "Enter valid non-negative costs and prices." }, { status: 400 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const reference = `REV-${randomUUID()}`;
      for (const change of changes) {
        const [item] = await db.select().from(items).where(eq(items.id, Number(change.id))).for("update");
        if (!item || !canAccessCompany(user, item.companyId)) return Response.json({ error: "An item is unavailable in your assigned companies." }, { status: 403 });
        const [company] = await db.select().from(companies).where(and(eq(companies.id, item.companyId), eq(companies.active, true)));
        const [location] = await db.select().from(inventoryLocations).where(and(eq(inventoryLocations.id, item.locationId!), eq(inventoryLocations.companyId, item.companyId), eq(inventoryLocations.active, true)));
        if (!company || !location || item.status !== "active") return Response.json({ error: "Select active items and inventories." }, { status: 400 });
        if (item.cost !== change.expectedCost || item.salesPrice !== change.expectedPrice || item.quantity !== change.expectedQuantity) return Response.json({ error: "Stock changed while you were editing. Refresh and review the values." }, { status: 409 });
        const cost = Number(change.cost), price = Number(change.salesPrice);
        if (item.quantity < 0 && cost !== item.cost) return Response.json({ error: "Resolve negative stock before changing its cost." }, { status: 409 });
        const delta = Math.round((cost - item.cost) * item.quantity * 100) / 100;
        if (!Number.isFinite(delta)) return Response.json({ error: "Stock value is too large." }, { status: 400 });
        if (delta) {
          const [asset] = await db.select().from(accounts).where(and(eq(accounts.companyId, item.companyId), eq(accounts.systemRole, "INVENTORY"), eq(accounts.active, true), eq(accounts.currency, company.baseCurrency))).limit(1);
          if (!asset) return Response.json({ error: `Configure the inventory asset account for ${company.name} before revaluation.` }, { status: 409 });
          let [adjustment] = await db.select().from(accounts).where(and(eq(accounts.companyId, item.companyId), eq(accounts.code, "STOCK-REVAL"))).limit(1);
          if (!adjustment) [adjustment] = await db.insert(accounts).values({ companyId: item.companyId, code: "STOCK-REVAL", name: "Stock Revaluation Adjustment", type: "Expense", currency: company.baseCurrency }).returning();
          if (!adjustment.active || adjustment.type !== "Expense" || adjustment.currency !== company.baseCurrency || adjustment.systemRole) return Response.json({ error: "The STOCK-REVAL account must be an active, unlinked expense account in the company currency." }, { status: 409 });
          const [entry] = await db.insert(journalEntries).values({ companyId: item.companyId, locationId: item.locationId, entryDate: new Date().toISOString().slice(0, 10), reference, description: `Stock revaluation: ${item.sku} · ${location.name}` }).returning();
          await db.insert(journalLines).values([{ journalEntryId: entry.id, accountName: asset.name, debit: Math.max(delta, 0), credit: Math.max(-delta, 0) }, { journalEntryId: entry.id, accountName: adjustment.name, debit: Math.max(-delta, 0), credit: Math.max(delta, 0) }]);
          await db.update(accounts).set({ balance: sql`${accounts.balance} + ${delta}` }).where(eq(accounts.id, asset.id));
          await db.update(accounts).set({ balance: sql`${accounts.balance} - ${delta}` }).where(eq(accounts.id, adjustment.id));
        }
        await db.update(items).set({ cost, salesPrice: price }).where(eq(items.id, item.id));
        await db.insert(auditLog).values({ companyId: item.companyId, action: "revalued", entityType: "item", entityId: item.id, details: JSON.stringify({ reference, userId: user.id, locationId: item.locationId, quantity: item.quantity, oldCost: item.cost, newCost: cost, oldPrice: item.salesPrice, newPrice: price, valueAdjustment: delta }) });
      }
      return Response.json({ saved: changes.length, reference });
    });
  } catch { return Response.json({ error: "Could not save revaluation. Refresh and try again." }, { status: 500 }); }
}
