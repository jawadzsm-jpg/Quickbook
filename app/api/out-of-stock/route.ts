import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, inventoryLocations, items } from '@/db/schema';
import { requireApiUser } from '@/lib/auth';

export async function GET(request: Request) {
 const user = await requireApiUser(request, 'inventory:read');
 if (user instanceof Response) return user;
 // Shared product catalogue across companies. A product created in one company is
 // offered to other companies as an out-of-stock item that they can reuse.
 // Source quantity, cost and prices are never exposed here.
 try {
  const url = new URL(request.url);
  const selectedCompanyId = Number(url.searchParams.get('companyId'));
  const selectedLocationId = Number(url.searchParams.get('locationId'));
  const hasDestination = Number.isInteger(selectedCompanyId) && selectedCompanyId > 0 && Number.isInteger(selectedLocationId) && selectedLocationId > 0;

  const records = await getDb().select({
   id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name,
   description: items.description, specifications: items.specifications, category: items.category,
   companyId: items.companyId, locationId: items.locationId, quantity: items.quantity,
   company: companies.name, inventory: inventoryLocations.name,
  }).from(items)
   .innerJoin(companies, eq(items.companyId, companies.id))
   .innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
   .where(and(eq(companies.active, true), eq(inventoryLocations.active, true)))
   .orderBy(asc(items.name));

  let shared = records.filter(row => row.quantity <= 0);
  if (hasDestination) {
   const destinationSkus = new Set(
    records
     .filter(row => row.companyId === selectedCompanyId && row.locationId === selectedLocationId)
     .map(row => row.sku.trim().toLowerCase())
     .filter(Boolean),
   );
   shared = records.filter(row =>
    row.companyId !== selectedCompanyId && !destinationSkus.has(row.sku.trim().toLowerCase()),
   );
  }

  return Response.json({
   records: shared.map(row => ({
    id: row.id,
    itemNumber: row.itemNumber,
    sku: row.sku,
    name: row.name,
    description: row.description,
    specifications: row.specifications,
    category: row.category,
    company: row.company,
    inventory: row.inventory,
   })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
 } catch { return Response.json({ error: 'Could not load shared out-of-stock items.' }, { status: 500 }); }
}
