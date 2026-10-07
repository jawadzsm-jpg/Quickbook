import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, cargos } from "@/db/schema";
import { isAdministrator, requireCompanyAccess } from "@/lib/auth";
import { parseCargo } from "@/lib/cargo";

// Shared cargo / freight agent list: every signed-in user with access to the company can view and add entries.
// The user who added an entry, or an administrator, can edit it; only administrators can delete.

const toRow = (record: typeof cargos.$inferSelect) => ({ ...record, modes: record.modes ? record.modes.split(",") : [], destinations: record.destinations ? record.destinations.split(",") : [] });
const companyFrom = (value: unknown) => Number(value);

export async function GET(request: Request) {
  const companyId = companyFrom(new URL(request.url).searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId);
  if (user instanceof Response) return user;
  const rows = await getDb().select().from(cargos).where(eq(cargos.companyId, companyId)).orderBy(desc(cargos.id));
  return Response.json({ records: rows.map(toRow), canDelete: isAdministrator(user), userId: user.id }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = companyFrom(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  let cargo;
  try { cargo = parseCargo(payload); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the cargo details." }, { status: 400 }); }
  const db = getDb();
  const [record] = await db.insert(cargos).values({ companyId, ...cargo, modes: cargo.modes.join(","), destinations: cargo.destinations.join(","), createdByUserId: user.id, createdByName: user.fullName }).returning();
  await db.insert(auditLog).values({ companyId, action: "created", entityType: "cargo", entityId: record.id, details: JSON.stringify({ actorId: user.id, name: record.name }) });
  return Response.json({ record: toRow(record) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = companyFrom(payload.companyId), id = Number(payload.id);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  const db = getDb();
  const [existing] = await db.select().from(cargos).where(and(eq(cargos.id, id), eq(cargos.companyId, companyId))).limit(1);
  if (!existing) return Response.json({ error: "Cargo entry not found." }, { status: 404 });
  if (!isAdministrator(user) && existing.createdByUserId !== user.id) return Response.json({ error: "Only the person who added this cargo entry or an administrator can edit it." }, { status: 403 });
  let cargo;
  try { cargo = parseCargo(payload); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the cargo details." }, { status: 400 }); }
  const [record] = await db.update(cargos).set({ ...cargo, modes: cargo.modes.join(","), destinations: cargo.destinations.join(","), updatedAt: new Date().toISOString() }).where(eq(cargos.id, id)).returning();
  await db.insert(auditLog).values({ companyId, action: "updated", entityType: "cargo", entityId: id, details: JSON.stringify({ actorId: user.id, name: record.name }) });
  return Response.json({ record: toRow(record) });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = companyFrom(params.get("companyId")), id = Number(params.get("id"));
  // requireApiUser already limits DELETE to administrators.
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  const db = getDb();
  const [record] = await db.delete(cargos).where(and(eq(cargos.id, id), eq(cargos.companyId, companyId))).returning();
  if (!record) return Response.json({ error: "Cargo entry not found." }, { status: 404 });
  await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "cargo", entityId: id, details: JSON.stringify({ actorId: user.id, name: record.name }) });
  return Response.json({ ok: true });
}
