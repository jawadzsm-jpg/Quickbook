import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies, contacts, staffSalarySheets } from "@/db/schema";
import { apiRoute, RequestError } from "@/lib/api";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { validateStaffSalaryData } from "@/lib/staff-salary-sheet";

const serialize = (row: typeof staffSalarySheets.$inferSelect) => ({ id: row.id, revision: row.revision, data: { referenceNo: "", ...JSON.parse(row.data) }, letterhead: JSON.parse(row.letterhead) });
async function handle(request: Request) {
  const user = await requireApiUser(request); if (user instanceof Response) return user;
  const input = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json();
  const companyId = Number(input.companyId);
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !isAdministrator(user) || !canAccessCompany(user, companyId)) throw new RequestError("Company administrator access required.", 403);
  const db = getDb();
  if (request.method === "GET") {
    const rows = await db.select().from(staffSalarySheets).where(eq(staffSalarySheets.companyId, companyId)).orderBy(desc(staffSalarySheets.id));
    return Response.json({ records: rows.map(serialize) });
  }
  const id = Number(input.id), revision = Number(input.revision);
  let existing: typeof staffSalarySheets.$inferSelect | undefined;
  if (request.method !== "POST") {
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(revision) || revision < 1) throw new RequestError("Choose a saved salary sheet.");
    [existing] = await db.select().from(staffSalarySheets).where(and(eq(staffSalarySheets.id, id), eq(staffSalarySheets.companyId, companyId))).for("update");
    if (!existing) throw new RequestError("Salary sheet not found.", 404);
    if (existing.revision !== revision) throw new RequestError("This salary sheet changed. Reopen it before saving or deleting.", 409);
  }
  if (request.method === "DELETE") {
    await db.execute(sql`DELETE FROM record_attachments WHERE company_id = ${companyId} AND entity_type = 'staff_salary_sheet' AND entity_id = ${id}`);
    await db.delete(staffSalarySheets).where(and(eq(staffSalarySheets.id, id), eq(staffSalarySheets.companyId, companyId)));
    await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "staff_salary_sheet", entityId: id, details: `Salary sheet deleted by ${user.email}` });
    return Response.json({ ok: true });
  }
  const data = validateStaffSalaryData(input.data);
  const employees = await db.select({ id: contacts.id, currency: contacts.currency }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "employee")));
  if (data.lines.some(line => line.employeeId !== null && !employees.some(employee => employee.id === line.employeeId && employee.currency === data.currency))) throw new RequestError("Select employees from this company in the sheet currency.");
  const [company] = await db.select({ name: companies.name, logoData: companies.logoData, rightLogoData: companies.rightLogoData, addressLine1: companies.addressLine1, addressLine2: companies.addressLine2, city: companies.city, country: companies.country, phone: companies.phone, email: companies.email, letterheadDesign: companies.letterheadDesign, documentColor: companies.documentColor }).from(companies).where(eq(companies.id, companyId));
  if (!company) throw new RequestError("Company not found.", 404);
  const values = { data: JSON.stringify(data), letterhead: existing?.letterhead ?? JSON.stringify(company) };
  const [row] = existing ? await db.update(staffSalarySheets).set({ ...values, revision: revision + 1, updatedAt: new Date() }).where(and(eq(staffSalarySheets.id, id), eq(staffSalarySheets.companyId, companyId))).returning() : await db.insert(staffSalarySheets).values({ companyId, ...values }).returning();
  await db.insert(auditLog).values({ companyId, action: existing ? "updated" : "created", entityType: "staff_salary_sheet", entityId: row.id, details: `Salary sheet ${data.month} saved by ${user.email}` });
  return Response.json({ record: serialize(row) }, { status: existing ? 200 : 201 });
}
export const GET = apiRoute(handle);
export const POST = apiRoute(handle, { transaction: true });
export const PATCH = apiRoute(handle, { transaction: true });
export const DELETE = apiRoute(handle, { transaction: true });
