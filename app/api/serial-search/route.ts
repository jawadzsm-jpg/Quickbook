import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryLocations, items, transactionLines, transactions } from "@/db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";
import { failureResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const user = await requireApiUser(request, "workspace:read");
  if (user instanceof Response) return user;
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const query = (url.searchParams.get("q") || "").trim();
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !query || query.length > 200) return Response.json({ error: "Select a company and enter a serial number of 1–200 characters." }, { status: 400 });
  if (!canAccessCompany(user, companyId)) return Response.json({ error: "Company access denied." }, { status: 403 });
  try {
    const db = getDb();
    const fields = { id: transactions.id, type: transactions.type, number: transactions.number, date: transactions.transactionDate, party: transactions.party, currency: transactions.currency, status: transactions.status, inventory: inventoryLocations.name };
    const scope = and(eq(transactions.companyId, companyId), inArray(transactions.type, ["invoice", "bill"]));
    const [lines, documents] = await Promise.all([
      db.select({ ...fields, lineId: transactionLines.id, serialNumber: transactionLines.serialNumber, description: transactionLines.description, sku: items.sku, quantity: transactionLines.quantity, unitPrice: transactionLines.unitPrice, total: transactionLines.total, comments: transactionLines.comments }).from(transactionLines)
        .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).leftJoin(items, eq(transactionLines.itemId, items.id)).leftJoin(inventoryLocations, eq(transactions.locationId, inventoryLocations.id))
        .where(and(scope, sql`strpos(lower(${transactionLines.serialNumber}), lower(${query})) > 0`)).orderBy(desc(transactions.transactionDate), desc(transactions.id), desc(transactionLines.id)).limit(101),
      db.select({ ...fields, serialNumber: transactions.serialNumber, total: transactions.total, comments: transactions.comments }).from(transactions).leftJoin(inventoryLocations, eq(transactions.locationId, inventoryLocations.id))
        .where(and(scope, sql`strpos(lower(${transactions.serialNumber}), lower(${query})) > 0`)).orderBy(desc(transactions.transactionDate), desc(transactions.id)).limit(101),
    ]);
    const results = [...lines.map(row => ({ ...row, scope: "item" as const })), ...documents.map(row => ({ ...row, scope: "document" as const, lineId: null, description: "Document-level serial number — open the document to identify the item", sku: null, quantity: null, unitPrice: null }))].sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id || (b.lineId || 0) - (a.lineId || 0));
    return Response.json({ results: results.slice(0,100), truncated: results.length > 100 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failureResponse(error, crypto.randomUUID(), "/api/serial-search"); }
}
