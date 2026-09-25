import { eq, ne, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { canAccessCompany, isAdministrator, isGlobalAdmin, requireApiUser } from "@/lib/auth";

const imageFields = new Set(["logoData", "rightLogoData", "loginLogoData", "loginCompanyLogoData", "loginBackgroundData"]);
const fields = new Set([...imageFields, "loginDisplayName", "loginCopyrightYears", "loginBackgroundColor", "loginBranding"]);

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const field = payload.field;
    const value = payload.value;
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !canAccessCompany(user, companyId) || !isAdministrator(user)) {
      return Response.json({ error: "Company administrator access required." }, { status: 403 });
    }
    if (typeof field !== "string" || !fields.has(field)) return Response.json({ error: "Choose a company logo or login page setting." }, { status: 400 });
    if (field === "loginBranding") {
      if (!isGlobalAdmin(user)) return Response.json({ error: "All Administrator access required to select the login page company." }, { status: 403 });
      if (typeof value !== "boolean") return Response.json({ error: "Choose whether to show this company on the login page." }, { status: 400 });
    } else if (typeof value !== "string") return Response.json({ error: "Choose a valid setting." }, { status: 400 });
    if (imageFields.has(field) && value && (typeof value !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > (field === "loginBackgroundData" ? 2_700_000 : 700_000))) {
      return Response.json({ error: `Upload a PNG, JPG, or WebP image smaller than ${field === "loginBackgroundData" ? "2 MB" : "500 KB"}.` }, { status: 400 });
    }
    if (field === "loginBackgroundColor" && (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))) {
      return Response.json({ error: "Choose a valid login background color." }, { status: 400 });
    }
    if (field === "loginDisplayName" && (typeof value !== "string" || value.trim().length > 120)) {
      return Response.json({ error: "Enter a login company name under 120 characters." }, { status: 400 });
    }
    if (field === "loginCopyrightYears" && (typeof value !== "string" || !/^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/.test(value))) {
      return Response.json({ error: "Enter copyright years such as 1996-2021." }, { status: 400 });
    }
    return await withWriteTransaction(async () => {
      const db = getDb();
      if (field === "loginBranding") {
        await db.execute(sql`LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE`);
      }
      const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!existing) return Response.json({ error: "Company not found." }, { status: 404 });
      if (field === "loginBranding" && value) await db.update(companies).set({ loginBranding: false }).where(ne(companies.id, companyId));
      const change = field === "loginBranding" ? { loginBranding: value as boolean }
        : field === "loginBackgroundColor" ? { loginBackgroundColor: value as string }
        : field === "loginBackgroundData" ? { loginBackgroundData: value as string }
        : field === "loginLogoData" ? { loginLogoData: value as string }
        : field === "loginCompanyLogoData" ? { loginCompanyLogoData: value as string }
        : field === "loginDisplayName" ? { loginDisplayName: (value as string).trim() }
        : field === "loginCopyrightYears" ? { loginCopyrightYears: value as string }
        : field === "rightLogoData" ? { rightLogoData: value as string }
        : { logoData: value as string };
      const [record] = await db.update(companies).set(change).where(eq(companies.id, companyId)).returning();
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: `${field} updated by ${user.email}` });
      return Response.json({ record });
    });
  } catch {
    return Response.json({ error: "Could not save the setting. Please try again." }, { status: 500 });
  }
}
