import { eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";
import { validateLetterheadSettings } from "@/lib/letterhead";

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !canAccessCompany(user, companyId) || !isAdministrator(user)) {
      return Response.json({ error: "Company administrator access required." }, { status: 403 });
    }
    if (typeof payload.value !== "string") return Response.json({ error: "Choose valid letterhead settings." }, { status: 400 });
    let value: string;
    try { value = JSON.stringify(validateLetterheadSettings(payload.value)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the letterhead." }, { status: 400 }); }
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [record] = await db.update(companies).set({ letterheadDesign: value }).where(eq(companies.id, companyId)).returning();
      if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: `Letterheads updated by ${user.email}` });
      return Response.json({ record });
    });
  } catch {
    return Response.json({ error: "Could not save letterhead settings." }, { status: 500 });
  }
}
