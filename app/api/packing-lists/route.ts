import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, contacts, items, packingListLines, packingLists, transactionLines, transactions } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";

const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);
const finite = (value: unknown, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
const round = (value: number, places = 6) => Number(value.toFixed(places));

function cartonKeys(value: string) {
  const keys: string[] = [];
  for (const part of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]); const end = Number(range[2]);
      if (end >= start && end - start < 500) for (let current = start; current <= end; current += 1) keys.push(String(current));
      else keys.push(part);
    } else keys.push(part);
  }
  return [...new Set(keys)];
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save packing list.";
  return message.includes("does not exist") ? "The packing-list database is being updated. Please refresh in a moment." : message;
}

async function invoiceForCompany(invoiceId: number, companyId: number) {
  const [invoice] = await getDb().select().from(transactions).where(and(eq(transactions.id, invoiceId), eq(transactions.companyId, companyId), eq(transactions.type, "invoice"))).limit(1);
  return invoice;
}

async function responseData(invoiceId: number, companyId: number) {
  const db = getDb();
  const invoice = await invoiceForCompany(invoiceId, companyId);
  if (!invoice) return null;
  const invoiceLines = await db.select({
    id: transactionLines.id,
    itemId: transactionLines.itemId,
    itemNumber: items.itemNumber,
    sku: items.sku,
    description: transactionLines.description,
    invoicedQuantity: transactionLines.quantity,
    hsCode: items.hsCode,
    countryOfOrigin: items.countryOfOrigin,
    dimensionText: items.dimensionText,
    lengthCm: items.lengthCm,
    widthCm: items.widthCm,
    heightCm: items.heightCm,
    unitWeightKg: items.weightKg,
  }).from(transactionLines).leftJoin(items, eq(transactionLines.itemId, items.id)).where(eq(transactionLines.transactionId, invoiceId)).orderBy(asc(transactionLines.id));
  const packedRows = await db.select({ invoiceLineId: packingListLines.invoiceLineId, packedQuantity: packingListLines.packedQuantity })
    .from(packingListLines).innerJoin(packingLists, eq(packingListLines.packingListId, packingLists.id)).where(eq(packingLists.invoiceId, invoiceId));
  const packed = new Map<number, number>();
  for (const row of packedRows) packed.set(row.invoiceLineId, (packed.get(row.invoiceLineId) ?? 0) + Number(row.packedQuantity));
  const lists = await db.select({
    id: packingLists.id, number: packingLists.number, packingDate: packingLists.packingDate, deliveryAddress: packingLists.deliveryAddress,
    memo: packingLists.memo, createdAt: packingLists.createdAt, creator: appUsers.fullName, creatorEmail: appUsers.email,
  }).from(packingLists).leftJoin(appUsers, eq(packingLists.createdByUserId, appUsers.id)).where(eq(packingLists.invoiceId, invoiceId)).orderBy(asc(packingLists.id));
  const listIds = lists.map((list) => list.id);
  const savedLines = listIds.length ? await db.select().from(packingListLines).where(inArray(packingListLines.packingListId, listIds)).orderBy(asc(packingListLines.id)) : [];
  const [customer] = await db.select().from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer"), eq(contacts.name, invoice.party))).limit(1);
  return {
    invoice,
    customer: customer ?? null,
    lines: invoiceLines.map((line) => {
      const packedQuantity = round(packed.get(line.id) ?? 0);
      return { ...line, packedQuantity, remainingQuantity: round(Math.max(0, Number(line.invoicedQuantity) - packedQuantity)) };
    }),
    packingLists: lists.map((list) => ({ ...list, lines: savedLines.filter((line) => line.packingListId === list.id) })),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const invoiceId = Number(url.searchParams.get("invoiceId"));
    const user = await requireCompanyAccess(request, companyId, "inventory:read");
    if (user instanceof Response) return user;
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) return Response.json({ error: "Select a customer invoice." }, { status: 400 });
    const data = await responseData(invoiceId, companyId);
    return data ? Response.json(data, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Customer invoice not found." }, { status: 404 });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 500 }); }
}

async function savePackingList(request: Request, editing: boolean) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const invoiceId = Number(payload.invoiceId);
    const packingListId = editing ? Number(payload.packingListId) : 0;
    const packingDate = clean(payload.packingDate, 10);
    const deliveryAddress = clean(payload.deliveryAddress, 500);
    const memo = clean(payload.memo, 1_000);
    const requested = Array.isArray(payload.lines) ? payload.lines.slice(0, 500) as Array<Record<string, unknown>> : [];
    const user = await requireCompanyAccess(request, companyId, "sales:write", true);
    if (user instanceof Response) return user;
    if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(packingDate)) return Response.json({ error: "Select an invoice and packing date." }, { status: 400 });
    if (editing && (!Number.isInteger(packingListId) || packingListId <= 0)) return Response.json({ error: "Select a saved packing list to edit." }, { status: 400 });
    if (!requested.length) return Response.json({ error: "Select at least one invoice item to pack." }, { status: 400 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      await db.execute(sql`SELECT id FROM transactions WHERE id = ${invoiceId} FOR UPDATE`);
      const invoice = await invoiceForCompany(invoiceId, companyId);
      if (!invoice) return Response.json({ error: "Customer invoice not found." }, { status: 404 });
      const [existingList] = editing ? await db.select().from(packingLists).where(and(eq(packingLists.id, packingListId), eq(packingLists.invoiceId, invoiceId), eq(packingLists.companyId, companyId))).limit(1) : [];
      if (editing && !existingList) return Response.json({ error: "Packing list not found." }, { status: 404 });
      if (existingList) await db.execute(sql`SELECT id FROM packing_lists WHERE id = ${packingListId} FOR UPDATE`);
      const sourceLines = await db.select({
        id: transactionLines.id, itemId: transactionLines.itemId, description: transactionLines.description, invoicedQuantity: transactionLines.quantity,
        itemNumber: items.itemNumber, sku: items.sku, hsCode: items.hsCode, countryOfOrigin: items.countryOfOrigin,
        dimensionText: items.dimensionText, lengthCm: items.lengthCm, widthCm: items.widthCm, heightCm: items.heightCm, unitWeightKg: items.weightKg,
      }).from(transactionLines).leftJoin(items, eq(transactionLines.itemId, items.id)).where(eq(transactionLines.transactionId, invoiceId));
      const source = new Map(sourceLines.map((line) => [line.id, line]));
      const packedRows = await db.select({ packingListId: packingListLines.packingListId, invoiceLineId: packingListLines.invoiceLineId, packedQuantity: packingListLines.packedQuantity })
        .from(packingListLines).innerJoin(packingLists, eq(packingListLines.packingListId, packingLists.id)).where(eq(packingLists.invoiceId, invoiceId));
      const alreadyPacked = new Map<number, number>();
      for (const row of packedRows) if (row.packingListId !== packingListId) alreadyPacked.set(row.invoiceLineId, (alreadyPacked.get(row.invoiceLineId) ?? 0) + Number(row.packedQuantity));
      let nextAutomaticCarton = 1;
      const reservedCartons = new Set(requested.flatMap((input) => cartonKeys(clean(input.cartonReference, 120))));
      const requestedByLine = new Map<number, number>();
      const preparedRows = requested.map((input) => {
        const invoiceLineId = Number(input.invoiceLineId);
        const line = source.get(invoiceLineId);
        if (!line) throw new Error("One or more selected items do not belong to this invoice.");
        const packedQuantity = finite(input.packedQuantity, -1);
        if (packedQuantity <= 0) throw new Error(`Enter a packing quantity for ${line.description}.`);
        requestedByLine.set(invoiceLineId, (requestedByLine.get(invoiceLineId) ?? 0) + packedQuantity);
        const unitsPerCarton = finite(input.unitsPerCarton, -1);
        if (unitsPerCarton <= 0) throw new Error(`Enter units per carton for ${line.description}.`);
        const minimumCartons = Math.ceil(packedQuantity / unitsPerCarton);
        let cartonReference = clean(input.cartonReference, 120);
        const keys = cartonKeys(cartonReference);
        if (minimumCartons > 1 && keys.length === 1 && /^\d+$/.test(keys[0])) {
          const start = Number(keys[0]);
          keys.splice(0, 1, ...Array.from({ length: minimumCartons }, (_, offset) => String(start + offset)));
          cartonReference = `${start}-${start + minimumCartons - 1}`;
        }
        if (!keys.length) {
          while (keys.length < minimumCartons) {
            const candidate = String(nextAutomaticCarton++);
            if (!reservedCartons.has(candidate)) keys.push(candidate);
          }
          cartonReference = keys.length === 1 ? keys[0] : keys.join(", ");
        }
        if (keys.length < minimumCartons) throw new Error(`${line.description} needs at least ${minimumCartons} carton number(s). Use a range such as 1-${minimumCartons}.`);
        const cartonCount = keys.length;
        const lengthCm = Math.max(0, finite(input.lengthCm, Number(line.lengthCm)));
        const widthCm = Math.max(0, finite(input.widthCm, Number(line.widthCm)));
        const heightCm = Math.max(0, finite(input.heightCm, Number(line.heightCm)));
        const defaultWeight = packedQuantity * Number(line.unitWeightKg || 0);
        const grossWeightKg = Math.max(0, finite(input.grossWeightKg, defaultWeight));
        const cbmPerCarton = round(lengthCm * widthCm * heightCm / 1_000_000);
        return {
          invoiceLineId, itemId: line.itemId, itemNumber: line.itemNumber ?? "", sku: line.sku ?? "", description: line.description,
          hsCode: line.hsCode ?? "", countryOfOrigin: line.countryOfOrigin ?? "", packedQuantity, unitsPerCarton, cartonCount, cartonReference, cartonKeys: keys,
          grossWeightKg: round(grossWeightKg, 3), cartonWeightKg: round(cartonCount ? grossWeightKg / cartonCount : 0, 3),
          dimensionText: clean(input.dimensionText || line.dimensionText, 120), lengthCm, widthCm, heightCm, cbmPerCarton, totalCbm: 0,
        };
      });
      for (const [invoiceLineId, quantity] of requestedByLine) {
        const line = source.get(invoiceLineId)!;
        const remaining = Number(line.invoicedQuantity) - (alreadyPacked.get(invoiceLineId) ?? 0);
        if (quantity > remaining + 0.000001) throw new Error(`${line.description} has only ${round(Math.max(0, remaining), 2)} remaining to pack.`);
      }
      const cbmByCarton = new Map<string, number>();
      for (const row of preparedRows) for (const key of row.cartonKeys) cbmByCarton.set(key, Math.max(cbmByCarton.get(key) ?? 0, row.cbmPerCarton));
      const assignedCartons = new Set<string>();
      const rows = preparedRows.map(({ cartonKeys: keys, ...row }) => ({ ...row, totalCbm: round(keys.reduce((sum, key) => {
        if (assignedCartons.has(key)) return sum;
        assignedCartons.add(key); return sum + (cbmByCarton.get(key) ?? 0);
      }, 0)) }));
      let targetId = packingListId;
      let number = existingList?.number ?? "";
      if (existingList) {
        await db.delete(packingListLines).where(eq(packingListLines.packingListId, packingListId));
        await db.update(packingLists).set({ packingDate, deliveryAddress, memo }).where(eq(packingLists.id, packingListId));
      } else {
        const existingLists = await db.select({ id: packingLists.id }).from(packingLists).where(eq(packingLists.invoiceId, invoiceId));
        const sequence = existingLists.length + 1;
        number = `PL-${clean(invoice.number, 80)}-${String(sequence).padStart(2, "0")}`;
        const [packingList] = await db.insert(packingLists).values({ companyId, locationId: invoice.locationId, invoiceId, number, packingDate, deliveryAddress, memo, createdByUserId: user.id }).returning();
        targetId = packingList.id;
      }
      await db.insert(packingListLines).values(rows.map((line) => ({ ...line, packingListId: targetId })));
      await db.insert(auditLog).values({ companyId, action: existingList ? "updated" : "created", entityType: "packing_list", entityId: targetId, details: `${number} ${existingList ? "updated" : "created"} from invoice ${invoice.number} with ${rows.length} item line(s) by ${user.email}` });
      const data = await responseData(invoiceId, companyId);
      return Response.json({ ...data, createdId: targetId }, { status: existingList ? 200 : 201 });
    });
  } catch (error) {
    const message = errorMessage(error);
    return Response.json({ error: message }, { status: message.includes("remaining to pack") || message.includes("carton number(s)") || message.startsWith("Enter ") || message.startsWith("One or more") ? 409 : 500 });
  }
}

export async function POST(request: Request) { return savePackingList(request, false); }
export async function PATCH(request: Request) { return savePackingList(request, true); }
