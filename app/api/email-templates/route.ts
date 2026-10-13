import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, emailTemplates } from "@/db/schema";
import { isAdministrator, requireCompanyAccess, type SessionUser } from "@/lib/auth";
import { canEmailDocuments, EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, EMAIL_TEMPLATE_NAME_MAX, emailDocumentTypeValues } from "@/lib/email-templates";
import { publicErrorMessage } from "@/lib/errors";

const message = (error: unknown) => publicErrorMessage(error, "Could not save the email template.");
const denied = () => Response.json({ error: "Only accountants and administrators use email templates." }, { status: 403 });

async function access(request: Request, companyId: number, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  return canEmailDocuments(user.role) ? user : denied();
}

/** Templates the person can use in a company: their own and the ones shared with the company. */
const visibleTo = (user: SessionUser, companyId: number) => and(eq(emailTemplates.companyId, companyId), or(eq(emailTemplates.ownerUserId, user.id), eq(emailTemplates.shared, true)));

function readTemplate(payload: Record<string, unknown>) {
  const name = String(payload.name ?? "").trim().slice(0, EMAIL_TEMPLATE_NAME_MAX);
  const documentType = String(payload.documentType ?? "any");
  const subject = String(payload.subject ?? "").trim();
  const body = String(payload.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!name) return "Give the template a name.";
  if (!emailDocumentTypeValues.includes(documentType)) return "Choose the document type.";
  if (!subject || subject.length > EMAIL_SUBJECT_MAX) return `Write a subject (up to ${EMAIL_SUBJECT_MAX} characters).`;
  if (!body || body.length > EMAIL_BODY_MAX) return `Write the message (up to ${EMAIL_BODY_MAX.toLocaleString("en")} characters).`;
  return { name, documentType, subject, body, shared: payload.shared === true };
}

export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  try {
    const rows = await getDb().select({ id: emailTemplates.id, name: emailTemplates.name, documentType: emailTemplates.documentType, subject: emailTemplates.subject, body: emailTemplates.body, shared: emailTemplates.shared, ownerUserId: emailTemplates.ownerUserId, ownerName: appUsers.fullName, updatedAt: emailTemplates.updatedAt })
      .from(emailTemplates).leftJoin(appUsers, eq(appUsers.id, emailTemplates.ownerUserId))
      .where(visibleTo(user, companyId)).orderBy(asc(emailTemplates.name), asc(emailTemplates.id));
    // Each person may change their own templates; administrators may also change shared ones.
    const templates = rows.map((row) => ({ ...row, mine: row.ownerUserId === user.id, editable: row.ownerUserId === user.id || (row.shared && isAdministrator(user)) }));
    return Response.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const user = await access(request, companyId, true);
    if (user instanceof Response) return user;
    const template = readTemplate(payload);
    if (typeof template === "string") return Response.json({ error: template }, { status: 400 });
    const [saved] = await getDb().insert(emailTemplates).values({ companyId, ownerUserId: user.id, ...template }).returning();
    return Response.json({ template: saved }, { status: 201 });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** The template when this person may change or delete it; otherwise a 404/403 response. */
async function editableTemplate(user: SessionUser, companyId: number, id: number) {
  const [row] = await getDb().select().from(emailTemplates).where(and(eq(emailTemplates.id, id), visibleTo(user, companyId))).limit(1);
  if (!row) return Response.json({ error: "Template not found." }, { status: 404 });
  return row.ownerUserId === user.id || (row.shared && isAdministrator(user)) ? row : Response.json({ error: "Only the person who made this template, or an administrator, can change it." }, { status: 403 });
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const user = await access(request, companyId, true);
    if (user instanceof Response) return user;
    const current = await editableTemplate(user, companyId, Number(payload.id));
    if (current instanceof Response) return current;
    // Deleting goes through PATCH: HTTP DELETE is reserved for administrators across the app.
    if (payload.remove === true) {
      await getDb().delete(emailTemplates).where(eq(emailTemplates.id, current.id));
      return Response.json({ ok: true });
    }
    const template = readTemplate(payload);
    if (typeof template === "string") return Response.json({ error: template }, { status: 400 });
    const [saved] = await getDb().update(emailTemplates).set({ ...template, updatedAt: new Date().toISOString() }).where(eq(emailTemplates.id, current.id)).returning();
    return Response.json({ template: saved });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
