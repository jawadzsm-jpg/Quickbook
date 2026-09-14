import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, withWriteTransaction } from '@/db';
import { companies, inventoryLocations, items, auditLog } from '@/db/schema';
import { requireApiUser, canAccessCompany, hasPermission } from '@/lib/auth';

export async function GET(request: Request) {
 const user = await requireApiUser(request, 'inventory:read');
 if (user instanceof Response) return user;
 // Shared, read-only catalogue explicitly available across company assignments.
 // Values in this catalogue are placeholders, never source stock or prices.
 try {
  const url = new URL(request.url);
  const selectedCompanyId = Number(url.searchParams.get('companyId'));
  const hasSelectedCompany = Number.isInteger(selectedCompanyId) && selectedCompanyId > 0;
  const db = getDb();
  const records = await db.select({
   id: items.id, itemNumber: items.itemNumber, sku: items.sku, name: items.name,
   description: items.description, specifications: items.specifications, category: items.category,
   companyId: items.companyId, company: companies.name, inventory: inventoryLocations.name,
   quantity: sql<number>`0`, cost: sql<number>`0`, salesPrice: sql<number>`0`, grnPrice: sql<number>`0`,
  }).from(items)
   .innerJoin(companies, eq(items.companyId, companies.id))
   .innerJoin(inventoryLocations, and(eq(items.locationId, inventoryLocations.id), eq(items.companyId, inventoryLocations.companyId)))
   .where(and(eq(companies.active, true), eq(inventoryLocations.active, true)))
   .orderBy(asc(companies.name), asc(inventoryLocations.name), asc(items.name));

  let visible = records;
  if (hasSelectedCompany) {
   const companySkus = new Set(
    records
     .filter(row => row.companyId === selectedCompanyId)
     .map(row => row.sku.trim().toLowerCase())
     .filter(Boolean),
   );
   visible = records.filter(row => row.companyId !== selectedCompanyId && !companySkus.has(row.sku.trim().toLowerCase()));
  }

  return Response.json({
   records: visible.map(row => ({
    id: row.id,
    itemNumber: row.itemNumber,
    sku: row.sku,
    name: row.name,
    description: row.description,
    specifications: row.specifications,
    category: row.category,
    company: row.company,
    inventory: row.inventory,
    quantity: row.quantity,
    cost: row.cost,
    salesPrice: row.salesPrice,
    grnPrice: row.grnPrice,
   })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
 } catch { return Response.json({ error: 'Could not load shared items.' }, { status: 500 }); }
}

export async function POST(request: Request) {
 const user = await requireApiUser(request, 'inventory:manage');
 if (user instanceof Response) return user;
 if (!hasPermission(user, 'inventory:manage')) return Response.json({error:'Inventory editing permission required.'},{status:403});
 const payload=await request.json().catch(()=>null);
 const sourceId=Number(payload?.sourceId), companyId=Number(payload?.companyId), locationId=Number(payload?.locationId);
 if (![sourceId,companyId,locationId].every(id=>Number.isInteger(id)&&id>0)) return Response.json({error:'Select an item, company and inventory.'},{status:400});
 if (!canAccessCompany(user,companyId)) return Response.json({error:'Company access denied.'},{status:403});
 try {
  return await withWriteTransaction(async ()=>{
   const db=getDb();
   const [destination]=await db.select({id:inventoryLocations.id}).from(inventoryLocations).innerJoin(companies,eq(inventoryLocations.companyId,companies.id)).where(and(eq(inventoryLocations.id,locationId),eq(companies.id,companyId),eq(companies.active,true),eq(inventoryLocations.active,true))).limit(1);
   if(!destination)throw Response.json({error:'Select an active inventory in the destination company.'},{status:400});
   const [entry]=await db.select({item:items}).from(items).innerJoin(companies,eq(items.companyId,companies.id)).innerJoin(inventoryLocations,and(eq(items.locationId,inventoryLocations.id),eq(items.companyId,inventoryLocations.companyId))).where(and(eq(items.id,sourceId),eq(companies.active,true),eq(inventoryLocations.active,true))).limit(1);
   if(!entry)throw Response.json({error:'Shared item is no longer available.'},{status:404});
   const source=entry.item;
   const itemNumber=source.itemNumber||String(13000+source.id);
   const [created]=await db.insert(items).values({
    companyId,locationId,itemNumber,sku:source.sku,name:source.name,category:source.category,
    description:source.description,specifications:source.specifications,hsCode:source.hsCode,countryOfOrigin:source.countryOfOrigin,
    dimensionText:source.dimensionText,lengthCm:source.lengthCm,widthCm:source.widthCm,heightCm:source.heightCm,weightKg:source.weightKg,
    quantity:0,cost:0,salesPrice:0,grnPrice:0,lastPurchasePrice:0,reorderPoint:0,
   }).onConflictDoNothing().returning();
   if(!created){
    const [existing]=await db.select({id:items.id,itemNumber:items.itemNumber,sku:items.sku}).from(items).where(and(eq(items.companyId,companyId),eq(items.locationId,locationId),eq(items.sku,source.sku),eq(items.itemNumber,itemNumber))).limit(1);
    if(existing)return Response.json({record:existing,existing:true});
    throw Response.json({error:'This inventory already has a different item using that SKU or Item No.'},{status:409});
   }
   await db.insert(auditLog).values({companyId,action:'created',entityType:'item',entityId:created.id,details:`Shared catalogue item ${created.sku} added with zero stock and prices by ${user.email}`});
   return Response.json({record:{id:created.id,itemNumber:created.itemNumber,sku:created.sku},existing:false},{status:201});
  });
 }catch(error){if(error instanceof Response)return error;return Response.json({error:'Could not add the shared item. Please refresh and try again.'},{status:500});}
}
