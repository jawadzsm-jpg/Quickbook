import { and, desc, eq } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, auditLog, rcmDeclarations } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export async function GET(request: Request) {
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    const user = await requireCompanyAccess(request, companyId, "workspace:read");
    if (user instanceof Response) return user;
    const rows = await getDb().select({ declaration: rcmDeclarations, createdBy: appUsers.fullName }).from(rcmDeclarations)
      .leftJoin(appUsers, eq(rcmDeclarations.createdByUserId, appUsers.id)).where(eq(rcmDeclarations.companyId, companyId))
      .orderBy(desc(rcmDeclarations.id)).limit(500);
    return Response.json({ declarations: rows.map(({ declaration, createdBy }) => ({ ...declaration, createdBy: createdBy || "" })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load RCM declarations." }, { status: 500 });
  }
}

async function save(request: Request, editing: boolean) {
  try {
    const input = await request.json() as Record<string, unknown>;
    const companyId = Number(input.companyId);
    const user = await requireCompanyAccess(request, companyId, "purchases:write", true);
    if (user instanceof Response) return user;
    const id = editing ? Number(input.id) : 0;
    const declarationDate = clean(input.declarationDate, 10), supplyDate = clean(input.supplyDate, 10);
    const validFrom = clean(input.validFrom, 10), validUntil = clean(input.validUntil, 10);
    const recipientCompany = clean(input.recipientCompany, 160), recipientTrn = clean(input.recipientTrn, 15);
    const supplierCompany = clean(input.supplierCompany, 160), supplierTrn = clean(input.supplierTrn, 15);
    const authorizedSignatory = clean(input.authorizedSignatory, 120), acquisitionPurpose = clean(input.acquisitionPurpose, 20);
    const stampLeft = Number(input.stampLeft), stampTop = Number(input.stampTop);
    if (![declarationDate, supplyDate, validFrom, validUntil].every(validDate) || validUntil < validFrom
      || !recipientCompany || !supplierCompany || !authorizedSignatory || !/^\d{15}$/.test(recipientTrn) || !/^\d{15}$/.test(supplierTrn)
      || !["resale", "manufacturing", "both"].includes(acquisitionPurpose)
      || typeof input.showStamp !== "boolean" || !Number.isInteger(stampLeft) || stampLeft < 0 || stampLeft > 170
      || !Number.isInteger(stampTop) || stampTop < 0 || stampTop > 260
      || (editing && (!Number.isInteger(id) || id < 1 || typeof input.revision !== "string"))) {
      return Response.json({ error: "Check the dates, company names, 15-digit TRNs, signatory and stamp position." }, { status: 400 });
    }
    const values = {
      declarationDate, supplyDate, validFrom, validUntil, recipientCompany, recipientTrn, supplierCompany, supplierTrn, authorizedSignatory, acquisitionPurpose,
      recipientLicense: clean(input.recipientLicense, 80), recipientAddress: clean(input.recipientAddress, 500), recipientContact: clean(input.recipientContact, 80),
      recipientTelephone: clean(input.recipientTelephone, 80), recipientEmail: clean(input.recipientEmail, 160), footerAddress: clean(input.footerAddress, 500),
      supplierLicense: clean(input.supplierLicense, 80), supplierAddress: clean(input.supplierAddress, 500), supplierManager: clean(input.supplierManager, 120),
      supplierContact: clean(input.supplierContact, 80), showStamp: input.showStamp === true, stampLeft, stampTop,
    };
    return await withWriteTransaction(async () => {
      const db = getDb();
      if (editing) {
        const [previous] = await db.select().from(rcmDeclarations).where(and(eq(rcmDeclarations.id, id), eq(rcmDeclarations.companyId, companyId))).limit(1);
        if (!previous) return Response.json({ error: "RCM declaration not found." }, { status: 404 });
        if (previous.updatedAt !== input.revision) return Response.json({ error: "This declaration changed in another window. Refresh before saving." }, { status: 409 });
        const [declaration] = await db.update(rcmDeclarations).set({ ...values, updatedAt: new Date().toISOString() })
          .where(and(eq(rcmDeclarations.id, id), eq(rcmDeclarations.companyId, companyId), eq(rcmDeclarations.updatedAt, previous.updatedAt))).returning();
        if (!declaration) return Response.json({ error: "This declaration changed in another window. Refresh before saving." }, { status: 409 });
        await db.insert(auditLog).values({ companyId, action: "updated", entityType: "rcm_declaration", entityId: id, details: JSON.stringify({ actor: user.email, number: declaration.number, before: previous, after: declaration }) });
        return Response.json({ declaration });
      }
      const [created] = await db.insert(rcmDeclarations).values({ ...values, companyId, createdByUserId: user.id, number: "" }).returning();
      const number = `RCM-${String(companyId).padStart(3, "0")}-${String(created.id).padStart(5, "0")}`;
      const [declaration] = await db.update(rcmDeclarations).set({ number }).where(eq(rcmDeclarations.id, created.id)).returning();
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "rcm_declaration", entityId: declaration.id, details: JSON.stringify({ actor: user.email, number, supplierCompany, supplierTrn }) });
      return Response.json({ declaration }, { status: 201 });
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save RCM declaration." }, { status: 500 });
  }
}

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }
