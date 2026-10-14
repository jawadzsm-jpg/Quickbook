import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { companies, emailSignatures } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { blankSignature, readSignature } from "@/lib/email-signature";
import { savedSignature } from "@/lib/email-signature-server";
import { publicErrorMessage } from "@/lib/errors";
import { eq } from "drizzle-orm";

// Each person's own email signature for a company (every role except Viewer, who sends no email).

async function access(request: Request, companyId: number, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  return user.role === "viewer" ? Response.json({ error: "Your role does not send emails." }, { status: 403 }) : user;
}

const fields = ({ enabled, closing, fullName, jobTitle, address, landline, fax, mobile, msn, skype, whatsapp, email, website, bannerData }: typeof emailSignatures.$inferSelect) =>
  ({ enabled, closing, fullName, jobTitle, address, landline, fax, mobile, msn, skype, whatsapp, email, website, bannerData });

/** The saved signature (or a starting one with the person's name and email) and the company logo it shows. */
export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  try {
    const row = await savedSignature(companyId, user.id);
    const companyLogo = row ? row.companyLogo : (await getDb().select({ logo: companies.logoData }).from(companies).where(eq(companies.id, companyId)).limit(1))[0]?.logo ?? "";
    return Response.json({ saved: Boolean(row), signature: row ? fields(row.signature) : blankSignature(user), companyLogo }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load the signature.") }, { status: 500 }); }
}

/** Save the person's signature: { companyId, ...signature }. */
export async function PUT(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const companyId = Number(payload.companyId);
  const user = await access(request, companyId, true);
  if (user instanceof Response) return user;
  const signature = readSignature(payload);
  if (typeof signature === "string") return Response.json({ error: signature }, { status: 400 });
  try {
    const values = { ...signature, updatedAt: new Date().toISOString() };
    const [saved] = await getDb().insert(emailSignatures).values({ companyId, userId: user.id, imageToken: randomBytes(24).toString("base64url"), ...values })
      .onConflictDoUpdate({ target: [emailSignatures.companyId, emailSignatures.userId], set: values }).returning();
    return Response.json({ saved: true, signature: fields(saved) });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not save the signature.") }, { status: 500 }); }
}
