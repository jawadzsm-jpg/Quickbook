import { and, eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { contacts, transactions, auditLog } from "@/db/schema";
import { isAdministrator, requireCompanyAccess } from "@/lib/auth";
import { dubaiDay } from "@/lib/document-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId, "workspace:read");
  if (user instanceof Response) return user;
  if (user.role !== "sales" && !isAdministrator(user)) return Response.json({ error: "Sales or administrator access required." }, { status: 403 });
  const db = getDb();
  if (isAdministrator(user)) {
    const reps = await db.execute(sql`SELECT u.id, u.full_name AS name FROM app_users u JOIN app_user_companies uc ON uc.user_id = u.id WHERE uc.company_id = ${companyId} AND u.role = 'sales' AND u.active = true ORDER BY u.full_name`);
    return Response.json({ reps: reps.rows });
  }
  const date = url.searchParams.get("date") || dubaiDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return Response.json({ error: "Choose a valid date." }, { status: 400 });
  const customers = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company, currency: contacts.currency, balance: contacts.balance, status: contacts.status }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer"), eq(contacts.salesOwnerId, user.id)));
  const activity = await db.select({ id: transactions.id, number: transactions.number, type: transactions.type, status: transactions.status, createdAt: transactions.createdAt }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.createdByUserId, user.id), sql`to_char(${transactions.createdAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') = ${date}`, sql`${transactions.type} IN ('quotation', 'estimate', 'sales order', 'proforma invoice', 'invoice')`));
  return Response.json({ date, customers, activity: activity.map(row => ({ ...row, canOpen: row.type === "invoice", status: row.type === "invoice" ? row.status : "Ask accountant for PDF / stamp / bank details" })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const payload = await request.json();
  const companyId = Number(payload.companyId), id = Number(payload.customerId);
  const user = await requireCompanyAccess(request, companyId, true, true);
  if (user instanceof Response) return user;
  const ownerId = payload.salesOwnerId === null ? null : Number(payload.salesOwnerId);
  if (!Number.isSafeInteger(id) || id <= 0 || (ownerId !== null && (!Number.isSafeInteger(ownerId) || ownerId <= 0))) return Response.json({ error: "Select a customer and sales user." }, { status: 400 });
  return withWriteTransaction(async () => {
    const db = getDb();
    if (ownerId !== null) {
      const reps = await db.execute(sql`SELECT u.id FROM app_users u JOIN app_user_companies uc ON uc.user_id = u.id WHERE u.id = ${ownerId} AND uc.company_id = ${companyId} AND u.role = 'sales' AND u.active = true`);
      if (!reps.rows.length) return Response.json({ error: "Select an active sales user assigned to this company." }, { status: 400 });
    }
    const [customer] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId), eq(contacts.type, "customer"))).for("update");
    if (!customer) return Response.json({ error: "Customer not found." }, { status: 404 });
    if ((payload.expectedOwnerId ?? null) !== customer.salesOwnerId) return Response.json({ error: "Assignment changed. Refresh before saving." }, { status: 409 });
    await db.update(contacts).set({ salesOwnerId: ownerId }).where(eq(contacts.id, id));
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "contact", entityId: id, details: JSON.stringify({ actorId: user.id, salesOwnerId: { before: customer.salesOwnerId, after: ownerId } }) });
    return Response.json({ success: true });
  });
}
