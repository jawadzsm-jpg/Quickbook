import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";

const templates = new Set(["classic", "modern", "minimal"]);

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save company setup.";
  if (message.includes("idx_companies_name")) return "A company with that name already exists.";
  return message.includes("does not exist") ? "The company database is being updated. Please refresh in a moment." : message;
}

export async function GET(request: Request) {
  const user = await requireApiUser(request, "workspace:read");
  if (user instanceof Response) return user;
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const [record] = await getDb().select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const name = text(payload.name, 120);
    const email = text(payload.email, 160).toLowerCase();
    const logoData = String(payload.logoData ?? "");
    const documentTemplate = text(payload.documentTemplate, 20);
    const documentColor = text(payload.documentColor, 7);
    if (!Number.isInteger(companyId) || companyId <= 0 || !name) return Response.json({ error: "Company name is required." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid company email address." }, { status: 400 });
    if (logoData && (!/^data:image\/(png|jpeg|webp);base64,/.test(logoData) || logoData.length > 700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP logo smaller than 500 KB." }, { status: 400 });
    if (!templates.has(documentTemplate) || !/^#[0-9a-fA-F]{6}$/.test(documentColor)) return Response.json({ error: "Choose a valid document design and color." }, { status: 400 });
    const db = getDb();
    const [record] = await db.update(companies).set({
      name, logoData, email,
      addressLine1: text(payload.addressLine1, 180), addressLine2: text(payload.addressLine2, 180), city: text(payload.city, 80), country: text(payload.country, 80), phone: text(payload.phone, 40), trn: text(payload.trn, 40),
      bankName: text(payload.bankName, 120), bankAccountName: text(payload.bankAccountName, 120), bankAccountNumber: text(payload.bankAccountNumber, 80), bankIban: text(payload.bankIban, 80).toUpperCase(), bankSwift: text(payload.bankSwift, 30).toUpperCase(),
      documentTemplate: documentTemplate as "classic" | "modern" | "minimal", documentColor,
    }).where(eq(companies.id, companyId)).returning();
    if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: `Company profile and document template updated by ${user.email}` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
