import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { userNotes } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { publicErrorMessage } from "@/lib/errors";

// Personal notes (My notes page): every query is limited to the signed-in user's own notes in a company they can open.
// (Removal is PATCH { action: "delete" }: DELETE requests are reserved for administrators app-wide.)

const NOTE_MAX = 1000;
const NOTES_PER_COMPANY = 100;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failed = (error: unknown) => json({ error: publicErrorMessage(error, "Could not update your notes.") }, 500);
const cleanBody = (value: unknown) => String(value ?? "").replace(/\r\n/g, "\n").trim();

const list = (userId: number, companyId: number) => getDb().select({ id: userNotes.id, body: userNotes.body, done: userNotes.done, createdAt: userNotes.createdAt, updatedAt: userNotes.updatedAt })
  .from(userNotes).where(and(eq(userNotes.userId, userId), eq(userNotes.companyId, companyId)))
  .orderBy(asc(userNotes.done), desc(userNotes.createdAt), desc(userNotes.id));

export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId);
  if (user instanceof Response) return user;
  try { return json({ notes: await list(user.id, companyId) }); } catch (error) { return failed(error); }
}

/** POST { companyId, body } adds a note. */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  const body = cleanBody(payload.body);
  if (!body || body.length > NOTE_MAX) return json({ error: `Write a note (up to ${NOTE_MAX} characters).` }, 400);
  try {
    const db = getDb();
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(userNotes).where(and(eq(userNotes.userId, user.id), eq(userNotes.companyId, companyId)));
    if (Number(count) >= NOTES_PER_COMPANY) return json({ error: `You can keep up to ${NOTES_PER_COMPANY} notes per company. Delete some finished ones first.` }, 409);
    await db.insert(userNotes).values({ userId: user.id, companyId, body });
    return json({ notes: await list(user.id, companyId) }, 201);
  } catch (error) { return failed(error); }
}

/** PATCH { companyId, id, action: "update" (body and/or done) | "delete" }. */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId), id = Number(payload.id), action = String(payload.action ?? "update");
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  if (!Number.isSafeInteger(id) || id <= 0 || !["update", "delete"].includes(action)) return json({ error: "Choose a note." }, 400);
  try {
    const db = getDb();
    const own = and(eq(userNotes.id, id), eq(userNotes.userId, user.id), eq(userNotes.companyId, companyId));
    if (action === "delete") {
      const [removed] = await db.delete(userNotes).where(own).returning();
      if (!removed) return json({ error: "Note not found." }, 404);
      return json({ notes: await list(user.id, companyId) });
    }
    const changes: Partial<typeof userNotes.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (payload.body !== undefined) {
      const body = cleanBody(payload.body);
      if (!body || body.length > NOTE_MAX) return json({ error: `Write a note (up to ${NOTE_MAX} characters).` }, 400);
      changes.body = body;
    }
    if (payload.done !== undefined) changes.done = payload.done === true;
    const [updated] = await db.update(userNotes).set(changes).where(own).returning();
    if (!updated) return json({ error: "Note not found." }, 404);
    return json({ notes: await list(user.id, companyId) });
  } catch (error) { return failed(error); }
}
