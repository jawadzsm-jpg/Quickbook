import { apiRoute } from "@/lib/api";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, companies, vatCodes } from "../../../db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update VAT codes.";
  if (message.includes("idx_vat_codes_company_code")) return "That VAT code already exists for this company.";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replaceAll(" ", "_");
}

function validRate(value: unknown) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

async function handleGET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const codes = await db.select().from(vatCodes).where(eq(vatCodes.companyId, companyId)).orderBy(asc(vatCodes.code));
    return Response.json({ codes });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const code = cleanCode(payload.code);
    const name = String(payload.name ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const rate = validRate(payload.rate);
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) return Response.json({ error: "VAT code must use 1–20 letters, numbers, hyphens or underscores." }, { status: 400 });
    if (!name || name.length > 80 || description.length > 500 || rate === null) return Response.json({ error: "Enter a name, a VAT rate from 0 to 100, and an optional description up to 500 characters." }, { status: 400 });
    const db = getDb();
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    const [record] = await db.insert(vatCodes).values({ companyId, code, name, rate, description }).returning();
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "vat_code", entityId: record.id, details: `${code} created at ${rate}%` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const name = String(payload.name ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const rate = validRate(payload.rate);
    if (!Number.isInteger(id) || !Number.isInteger(companyId) || !name || name.length > 80 || description.length > 500 || rate === null) {
      return Response.json({ error: "Enter valid VAT-code details." }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db.select().from(vatCodes).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId))).limit(1);
    if (!existing) return Response.json({ error: "VAT code not found." }, { status: 404 });
    const requestedActive = payload.active === undefined ? existing.active : payload.active === true;
    if (existing.system && !requestedActive) return Response.json({ error: "Standard VAT codes must remain active." }, { status: 400 });
    const [record] = await db.update(vatCodes).set({ name, rate: existing.system ? existing.rate : rate, description, active: requestedActive, updatedAt: new Date().toISOString() }).where(and(eq(vatCodes.id, id), eq(vatCodes.companyId, companyId))).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "vat_code", entityId: record.id, details: `${record.code} updated to ${record.rate}% (${record.active ? "active" : "inactive"})` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });

export const PATCH = apiRoute(handlePATCH, { transaction: true });
