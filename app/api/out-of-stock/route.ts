import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, inventoryLocations, items } from '@/db/schema';
import { requireApiUser, canAccessCompany } from '@/lib/auth';

export async function GET(request: Request) {
 const user = await requireApiUser(request, 'inventory:read');
 if (user instanceof Response) return user;
 // Share product identities missing from the selected inventory, regardless of
 // source stock. Source quantity, cost and prices are never exposed here.
 try {
  const url = new URL(request.url);
  const selectedCompanyId = Number(url.searchParams.get('companyId'));
  if (url.searchParams.has('companyId') && (!Number.isSafeInteger(selectedCompanyId) || selectedCompanyId <= 0 || !canAccessCompany(user, selectedCompanyId))) return Response.json({ error: 'Company access denied.' }, { status: 403 });
  const selectedLocationId = Number(url.searchParams.get('locationId'));
  const hasDestination = Number.isInteger(selectedCompanyId) && selectedCompanyId > 0 && Number.isInteger(selectedLocationId) && selectedLocationId > 0;

  const records = await getDb().select({
   id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name,
   description: items.description, specifications: items.specifications, category: items.category,
   companyId: items.companyId, locationId: items.locationId,
   company: companies.name, inventory: inventoryLocations.name,
  }).from(items)
   .innerJoin(companies, eq(items.companyId, companies.id))
   .innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
   .where(and(eq(companies.active, true), eq(inventoryLocations.active, true), eq(items.status, 'active')))
   .orderBy(asc(items.name));

  let shared = records;
  if (hasDestination) {
   const destinationRows = records.filter(row => row.companyId === selectedCompanyId && row.locationId === selectedLocationId);
   const destinationSkus = new Set(destinationRows.map(row => row.sku.trim().toLowerCase()).filter(Boolean));
   const destinationItemNumbers = new Set(destinationRows.map(row => row.itemNumber?.trim().toLowerCase()).filter((value): value is string => Boolean(value)));
   shared = shared.filter(row =>
    row.companyId !== selectedCompanyId
    && !destinationSkus.has(row.sku.trim().toLowerCase())
    && !(row.itemNumber && destinationItemNumbers.has(row.itemNumber.trim().toLowerCase())),
   );
  }
  shared = Array.from(new Map(shared.map(row => [`${row.sku.trim().toLowerCase()}\u0000${row.itemNumber?.trim().toLowerCase() ?? ''}`, row])).values());

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
