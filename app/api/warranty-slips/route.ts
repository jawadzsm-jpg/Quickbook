import { and, desc, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, contacts, items, transactionLines, transactions, warrantySlips } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { normalizeWarrantyStatus } from "@/lib/warranty-status";

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function list(companyId: number) {
  return getDb().select({
    slip: warrantySlips, customerName: contacts.name, customerCompany: contacts.company, createdBy: appUsers.fullName,
  }).from(warrantySlips)
    .innerJoin(contacts, eq(warrantySlips.customerId, contacts.id))
    .leftJoin(appUsers, eq(warrantySlips.createdByUserId, appUsers.id))
    .where(eq(warrantySlips.companyId, companyId)).orderBy(desc(warrantySlips.id)).limit(500);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const user = await requireCompanyAccess(request, companyId, "workspace:read");
    if (user instanceof Response) return user;
    const db = getDb();
    const invoiceId = Number(url.searchParams.get("invoiceId"));
    if (url.searchParams.has("invoiceId")) {
      const [invoice] = await db.select().from(transactions).where(and(eq(transactions.id, invoiceId), eq(transactions.companyId, companyId), eq(transactions.type, "invoice"))).limit(1);
      if (!invoice) return Response.json({ error: "Customer invoice not found in this company." }, { status: 404 });
      const lines = await db.select({ id: transactionLines.id, description: transactionLines.description, serialNumber: transactionLines.serialNumber, itemName: items.name, specifications: items.specifications })
        .from(transactionLines).leftJoin(items, eq(transactionLines.itemId, items.id)).where(eq(transactionLines.transactionId, invoiceId));
      return Response.json({ invoice, lines }, { headers: { "Cache-Control": "no-store" } });
    }
    const [slips, customers, invoices] = await Promise.all([
      list(companyId),
      db.select({ id: contacts.id, name: contacts.name, company: contacts.company, phone: contacts.phone, email: contacts.email }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer"))),
      db.select({ id: transactions.id, number: transactions.number, party: transactions.party, transactionDate: transactions.transactionDate }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, "invoice"))).orderBy(desc(transactions.id)).limit(500),
    ]);
    return Response.json({ slips: slips.map(({ slip, customerName, customerCompany, createdBy }) => ({ ...slip, status: normalizeWarrantyStatus(slip.status) ?? slip.status, customerName, customerCompany, createdBy: createdBy || "" })), customers, invoices }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load warranty slips." }, { status: 500 });
  }
}

async function save(request: Request, editing: boolean) {
  try {
    const input = await request.json() as Record<string, unknown>;
    const companyId = Number(input.companyId);
    const user = await requireCompanyAccess(request, companyId, "sales:write", true);
    if (user instanceof Response) return user;
    const customerId = Number(input.customerId);
    const invoiceId = input.invoiceId ? Number(input.invoiceId) : null;
    const invoiceLineId = input.invoiceLineId ? Number(input.invoiceLineId) : null;
    const id = editing ? Number(input.id) : 0;
    const slipDate = clean(input.slipDate, 10);
    const problem = clean(input.problem, 2000);
    const stampLeft = Number(input.stampLeft);
    const stampTop = Number(input.stampTop);
    const status = normalizeWarrantyStatus(clean(input.status, 30));
    if (!Number.isInteger(customerId) || customerId < 1 || !validDate(slipDate) || !problem || !status
      || (invoiceId !== null && (!Number.isInteger(invoiceId) || invoiceId < 1))
      || (invoiceLineId !== null && (!Number.isInteger(invoiceLineId) || invoiceLineId < 1))
      || (invoiceLineId !== null && invoiceId === null)
      || !Number.isInteger(stampLeft) || stampLeft < 0 || stampLeft > 170
      || !Number.isInteger(stampTop) || stampTop < 0 || stampTop > 260
      || typeof input.showStamp !== "boolean"
      || (editing && (!Number.isInteger(id) || id < 1 || typeof input.revision !== "string"))) {
      return Response.json({ error: "Check the customer, date, problem and stamp position." }, { status: 400 });
    }
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [customer] = await db.select().from(contacts).where(and(eq(contacts.id, customerId), eq(contacts.companyId, companyId), eq(contacts.type, "customer"))).limit(1);
      if (!customer) return Response.json({ error: "Select a customer from this company." }, { status: 400 });
      let invoice = null;
      if (invoiceId !== null) {
        [invoice] = await db.select().from(transactions).where(and(eq(transactions.id, invoiceId), eq(transactions.companyId, companyId), eq(transactions.type, "invoice"))).limit(1);
        if (!invoice || invoice.party.trim().toLocaleLowerCase() !== customer.name.trim().toLocaleLowerCase()) return Response.json({ error: "The selected invoice does not belong to this customer." }, { status: 400 });
        if (invoiceLineId !== null) {
          const [line] = await db.select({ id: transactionLines.id }).from(transactionLines).where(and(eq(transactionLines.id, invoiceLineId), eq(transactionLines.transactionId, invoiceId))).limit(1);
          if (!line) return Response.json({ error: "The selected item does not belong to this invoice." }, { status: 400 });
        }
      }
      const values = {
        customerId, invoiceId, invoiceLineId, slipDate, problem, status,
        contactName: clean(input.contactName, 120), contactPhone: clean(input.contactPhone, 80),
        contactEmail: clean(input.contactEmail, 160), customerReference: clean(input.customerReference, 100),
        invoiceNumber: invoice?.number ?? clean(input.invoiceNumber, 100), brand: clean(input.brand, 120),
        model: clean(input.model, 200), specs: clean(input.specs, 1000), serialNumber: clean(input.serialNumber, 200),
        remarks: clean(input.remarks, 2000), includedItems: clean(input.includedItems, 1000),
        showStamp: input.showStamp === true, stampLeft, stampTop,
      };
      if (editing) {
        const [previous] = await db.select().from(warrantySlips).where(and(eq(warrantySlips.id, id), eq(warrantySlips.companyId, companyId))).limit(1);
        if (!previous) return Response.json({ error: "Warranty slip not found." }, { status: 404 });
        if (previous.updatedAt !== input.revision) return Response.json({ error: "This slip changed in another window. Refresh before saving." }, { status: 409 });
        const [updated] = await db.update(warrantySlips).set({ ...values, updatedAt: new Date().toISOString() })
          .where(and(eq(warrantySlips.id, id), eq(warrantySlips.companyId, companyId), eq(warrantySlips.updatedAt, previous.updatedAt))).returning();
        if (!updated) return Response.json({ error: "This slip changed in another window. Refresh before saving." }, { status: 409 });
        await db.insert(auditLog).values({ companyId, action: "updated", entityType: "warranty_slip", entityId: id, details: JSON.stringify({ actor: user.email, number: updated.number, before: previous, after: updated }) });
        return Response.json({ slip: updated });
      }
      const [created] = await db.insert(warrantySlips).values({ ...values, companyId, createdByUserId: user.id, number: "" }).returning();
      const number = `WAR-${String(companyId).padStart(3, "0")}-${String(created.id).padStart(5, "0")}`;
      const [slip] = await db.update(warrantySlips).set({ number }).where(eq(warrantySlips.id, created.id)).returning();
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "warranty_slip", entityId: slip.id, details: JSON.stringify({ actor: user.email, number, customerId, invoiceId }) });
      return Response.json({ slip }, { status: 201 });
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save warranty slip." }, { status: 500 });
  }
}

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }
