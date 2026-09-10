import { apiRoute } from "@/lib/api";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, companies, companySettings } from "../../../db/schema";
import { hashAdminPin, isValidAdminPin, verifyAdminPin } from "../../../lib/admin-pin";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

async function handleGET(request: Request) {
  const authorization = await requireApiUser(request, true);
  if (authorization instanceof Response) return authorization;
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const [settings] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    return Response.json({ configured: Boolean(settings?.pinHash) });
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
    const currentPin = String(payload.currentPin ?? "");
    const newPin = String(payload.newPin ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!isValidAdminPin(newPin)) return Response.json({ error: "The new PIN must contain 4 to 12 numbers." }, { status: 400 });

    const db = getDb();
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    const [existing] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    if (existing?.pinHash && !(await verifyAdminPin(currentPin, existing.pinHash))) {
      return Response.json({ error: "The current admin PIN is incorrect." }, { status: 403 });
    }

    const pinHash = (await hashAdminPin(newPin));
    await db.insert(companySettings).values({ companyId, negativeStockPinHash: pinHash, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
      target: companySettings.companyId,
      set: { negativeStockPinHash: pinHash, updatedAt: new Date().toISOString() },
    });
    await db.insert(auditLog).values({ companyId, action: existing?.pinHash ? "changed" : "configured", entityType: "negative_stock_admin_pin", entityId: companyId, details: "Negative-stock override PIN updated from Management > Admin Controls" });
    return Response.json({ configured: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });
