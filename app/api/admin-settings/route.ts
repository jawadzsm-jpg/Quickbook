import { and, desc, eq, like } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, companies, companySettings } from "../../../db/schema";
import { hashAdminPin, isValidAdminPin, verifyAdminPin } from "../../../lib/admin-pin";
import { requireCompanyAccess } from "@/lib/auth";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const authorization = await requireCompanyAccess(request, companyId, true);
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    const [settings] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    const [lastChange] = await db.select({ action: auditLog.action, createdAt: auditLog.createdAt }).from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "negative_stock_admin_pin"))).orderBy(desc(auditLog.createdAt)).limit(1);
    const overrides = await db.select({ id: auditLog.id, entityId: auditLog.entityId, details: auditLog.details, createdAt: auditLog.createdAt }).from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "transaction"), like(auditLog.details, "%admin negative-stock override used%"))).orderBy(desc(auditLog.createdAt)).limit(10);
    return json({ configured: Boolean(settings?.pinHash), lastChange: lastChange ?? null, overrides });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload?.companyId);
  const authorization = await requireCompanyAccess(request, companyId, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const action = payload.action === "clear" ? "clear" : "set";
    const currentPin = String(payload.currentPin ?? "");
    const newPin = String(payload.newPin ?? "");
    if (action === "set" && !isValidAdminPin(newPin)) return json({ error: "The new PIN must contain 4 to 12 numbers." }, 400);

    const db = getDb();
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return json({ error: "Company not found." }, 404);
    const [existing] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    if (existing?.pinHash && !verifyAdminPin(currentPin, existing.pinHash)) return json({ error: "The current admin PIN is incorrect." }, 403);

    if (action === "clear") {
      if (!existing?.pinHash) return json({ configured: false });
      await db.update(companySettings).set({ negativeStockPinHash: "", updatedAt: new Date().toISOString() }).where(eq(companySettings.companyId, companyId));
      await db.insert(auditLog).values({ companyId, action: "removed", entityType: "negative_stock_admin_pin", entityId: companyId, details: `Negative-stock override PIN removed by ${authorization.email}; overrides are disabled` });
      return json({ configured: false });
    }

    const pinHash = hashAdminPin(newPin);
    await db.insert(companySettings).values({ companyId, negativeStockPinHash: pinHash, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
      target: companySettings.companyId,
      set: { negativeStockPinHash: pinHash, updatedAt: new Date().toISOString() },
    });
    await db.insert(auditLog).values({ companyId, action: existing?.pinHash ? "changed" : "configured", entityType: "negative_stock_admin_pin", entityId: companyId, details: `Negative-stock override PIN updated by ${authorization.email} from Management > Admin Controls` });
    return json({ configured: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}
