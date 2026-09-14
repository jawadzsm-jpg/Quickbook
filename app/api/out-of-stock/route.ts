import { and, asc, eq, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, inventoryLocations, items } from '@/db/schema';
import { requireApiUser } from '@/lib/auth';

export async function GET(request: Request) {
 const user = await requireApiUser(request, 'inventory:read');
 if (user instanceof Response) return user;
 // Shared, read-only catalogue explicitly available across company assignments.
 // Only product identity and availability are shared; no cost or financial fields.
 try {
  const records = await getDb().select({
   id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name,
   description: items.description, specifications: items.specifications, category: items.category,
   company: companies.name, inventory: inventoryLocations.name,
  }).from(items)
   .innerJoin(companies, eq(items.companyId, companies.id))
   .innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
   .where(and(lte(items.quantity, 0), eq(companies.active, true), eq(inventoryLocations.active, true)))
   .orderBy(asc(companies.name), asc(inventoryLocations.name), asc(items.name));
  return Response.json({ records }, { headers: { 'Cache-Control': 'private, no-store' } });
 } catch { return Response.json({ error: 'Could not load out-of-stock items.' }, { status: 500 }); }
}
