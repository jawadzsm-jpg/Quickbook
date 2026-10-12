import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, chequeTemplates } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { normalizeChequeTemplate } from "@/lib/cheque-template";
import { uaeChequeLayouts } from "@/lib/uae-cheque-layouts";

const MAX_BACKGROUND_LENGTH = 2_800_000; // about 2 MB of image as a data URL
const message = (error: unknown) => error instanceof Error ? error.message : "Could not load cheque templates.";
const validLayout = (key: unknown) => uaeChequeLayouts.some((layout) => layout.key === key);

/**
 * Company cheque templates (?companyId=). With &layoutKey= returns that bank's template (saved or default) and its
 * background scan; without it, the saved templates' settings for printing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId, "banking:write");
  if (user instanceof Response) return user;
  try {
    const db = getDb();
    const layoutKey = url.searchParams.get("layoutKey");
    if (layoutKey !== null) {
      if (!validLayout(layoutKey)) return Response.json({ error: "Select a UAE bank cheque layout." }, { status: 400 });
      const [row] = await db.select().from(chequeTemplates).where(and(eq(chequeTemplates.companyId, companyId), eq(chequeTemplates.layoutKey, layoutKey))).limit(1);
      return Response.json({ layoutKey, saved: Boolean(row), template: normalizeChequeTemplate(layoutKey, row?.config), backgroundData: row?.backgroundData ?? "", updatedAt: row?.updatedAt ?? null, updatedByName: row?.updatedByName ?? "" }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = await db.select({ layoutKey: chequeTemplates.layoutKey, config: chequeTemplates.config, updatedAt: chequeTemplates.updatedAt, updatedByName: chequeTemplates.updatedByName }).from(chequeTemplates).where(eq(chequeTemplates.companyId, companyId)).orderBy(asc(chequeTemplates.layoutKey));
    return Response.json({ templates: rows.map((row) => ({ layoutKey: row.layoutKey, template: normalizeChequeTemplate(row.layoutKey, row.config), updatedAt: row.updatedAt, updatedByName: row.updatedByName })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Save a bank's template: { companyId, layoutKey, template, backgroundData? } (accountants and administrators). */
export async function PUT(request: Request) {
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, "banking:write", true);
  if (user instanceof Response) return user;
  try {
    if (!validLayout(payload.layoutKey)) return Response.json({ error: "Select a UAE bank cheque layout." }, { status: 400 });
    const layoutKey = String(payload.layoutKey);
    const template = normalizeChequeTemplate(layoutKey, payload.template);
    const db = getDb();
    const [existing] = await db.select().from(chequeTemplates).where(and(eq(chequeTemplates.companyId, companyId), eq(chequeTemplates.layoutKey, layoutKey))).limit(1);
    let backgroundData = existing?.backgroundData ?? "";
    if (payload.backgroundData !== undefined) {
      backgroundData = String(payload.backgroundData ?? "");
      if (backgroundData && (backgroundData.length > MAX_BACKGROUND_LENGTH || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(backgroundData))) return Response.json({ error: "Upload a PNG, JPG or WebP cheque scan smaller than 2 MB." }, { status: 400 });
    }
    const values = { companyId, layoutKey, config: JSON.stringify(template), backgroundData, updatedByName: user.fullName || user.email, updatedAt: new Date().toISOString() };
    const [row] = existing
      ? await db.update(chequeTemplates).set(values).where(eq(chequeTemplates.id, existing.id)).returning()
      : await db.insert(chequeTemplates).values(values).returning();
    await db.insert(auditLog).values({ companyId, action: existing ? "updated" : "created", entityType: "cheque_template", entityId: row.id, details: JSON.stringify({ actorId: user.id, layoutKey, template }) });
    return Response.json({ layoutKey, saved: true, template, backgroundData: row.backgroundData, updatedAt: row.updatedAt, updatedByName: row.updatedByName });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Go back to the built-in positions for a bank: { companyId, layoutKey }. */
export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, "banking:write", true);
  if (user instanceof Response) return user;
  try {
    if (!validLayout(payload.layoutKey)) return Response.json({ error: "Select a UAE bank cheque layout." }, { status: 400 });
    const db = getDb();
    const [row] = await db.delete(chequeTemplates).where(and(eq(chequeTemplates.companyId, companyId), eq(chequeTemplates.layoutKey, String(payload.layoutKey)))).returning();
    if (row) await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "cheque_template", entityId: row.id, details: JSON.stringify({ actorId: user.id, layoutKey: row.layoutKey }) });
    return Response.json({ deleted: Boolean(row) });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
