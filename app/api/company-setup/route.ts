import { parseLayoutCollection, serializeLayoutCollection } from "@/lib/layout/schema";
import { parseBankAccounts, validBankStamp } from "@/lib/bank-accounts";
import { validateDocumentDesign } from "@/lib/document-design";
import { eq, ne, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";

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
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "Company access denied." }, { status: 403 });
    const [record] = await getDb().select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
    return Response.json({ record: user.role === "sales" ? { ...record, stampData: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankAccounts: "", bankStampData: "", documentDesign: "", letterheadDesign: "", documentLayout: "" } : record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const bankAndStampKeys = ["bankName", "bankAccountName", "bankAccountNumber", "bankIban", "bankSwift", "bankCurrency", "bankAccounts", "stampData", "bankStampData"];
    // Accountants always use this partial save; administrators use it for the Bank account section's own Save button.
    const bankOnlySave = Object.keys(payload).every((key) => key === "companyId" || bankAndStampKeys.includes(key));
    if ((user.role === "accountant" || (isAdministrator(user) && bankOnlySave)) && canAccessCompany(user, companyId)) {
      const keys = bankAndStampKeys;
      if (Object.keys(payload).some(key => key !== "companyId" && !keys.includes(key))) return Response.json({ error: "Accountants may update bank details and the company stamp only." }, { status: 403 });
      const updates: Record<string, string> = {};
      for (const key of keys) if (payload[key] !== undefined && key !== "bankAccounts") updates[key] = text(payload[key], key === "stampData" || key === "bankStampData" ? 700001 : 120);
      if (payload.bankAccounts !== undefined) { try { updates.bankAccounts = JSON.stringify(parseBankAccounts(payload.bankAccounts)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the bank accounts." }, { status: 400 }); } }
      if (updates.stampData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(updates.stampData) || updates.stampData.length > 700000)) return Response.json({ error: "Upload a PNG, JPG or WebP stamp smaller than 500 KB." }, { status: 400 });
      if (updates.bankStampData && !validBankStamp(updates.bankStampData)) return Response.json({ error: "Upload a PNG, JPG or WebP bank stamp smaller than 500 KB." }, { status: 400 });
      if (updates.bankCurrency !== undefined && !/^[A-Z]{3}$/.test(updates.bankCurrency)) return Response.json({ error: "Enter a three-letter bank currency." }, { status: 400 });
      if (!Object.keys(updates).length) return Response.json({ error: "Nothing to save." }, { status: 400 });
      return withWriteTransaction(async () => {
        const [record] = await getDb().update(companies).set(updates).where(eq(companies.id, companyId)).returning();
        if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
        await getDb().insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: JSON.stringify({ actorId: user.id, fields: Object.keys(updates), mode: "stamp-bank" }) });
        return Response.json({ record: user.role === "sales" ? { ...record, stampData: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankAccounts: "", bankStampData: "", documentDesign: "", letterheadDesign: "", documentLayout: "" } : record });
      });
    }
    if (!canAccessCompany(user, companyId) || !isAdministrator(user)) return Response.json({ error: "Company administrator access required." }, { status: 403 });
    // The layout builder saves only its own layout so it never overwrites other Company Setup fields.
    if (payload.documentLayout !== undefined && Object.keys(payload).every((key) => key === "companyId" || key === "documentLayout")) {
      const raw = String(payload.documentLayout);
      if (raw.length > 4_000_000) return Response.json({ error: "The layout is too large. Use smaller images." }, { status: 413 });
      let documentLayout = "";
      if (raw) {
        try { documentLayout = serializeLayoutCollection(parseLayoutCollection(raw)); } catch (error) { return Response.json({ error: `Check the layout: ${error instanceof Error ? error.message : "invalid layout"}` }, { status: 400 }); }
      }
      return withWriteTransaction(async () => {
        const [record] = await getDb().update(companies).set({ documentLayout }).where(eq(companies.id, companyId)).returning();
        if (!record) return Response.json({ error: "Company not found." }, { status: 404 });
        await getDb().insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: JSON.stringify({ actorId: user.id, fields: ["documentLayout"], mode: "layout-builder" }) });
        return Response.json({ record });
      });
    }
    const [existing] = await getDb().select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!existing) return Response.json({ error: "Company not found." }, { status: 404 });
    const rightLogoData = String(payload.rightLogoData ?? existing.rightLogoData);
    let documentDesign = existing.documentDesign;
    if (payload.documentDesign !== undefined) {
      try { documentDesign = JSON.stringify(validateDocumentDesign(String(payload.documentDesign))); } catch { return Response.json({ error: "Check the template fields, labels and print settings." }, { status: 400 }); }
    }
    const name = text(payload.name, 120);
    const email = text(payload.email, 160).toLowerCase();
    const logoData = String(payload.logoData ?? "");
    const loginLogoData = String(payload.loginLogoData ?? existing.loginLogoData);
    const loginCompanyLogoData = String(payload.loginCompanyLogoData ?? existing.loginCompanyLogoData);
    const loginDisplayName = text(payload.loginDisplayName ?? existing.loginDisplayName, 120);
    const loginCopyrightYears = text(payload.loginCopyrightYears ?? existing.loginCopyrightYears, 9);
    const loginBackgroundData = String(payload.loginBackgroundData ?? existing.loginBackgroundData);
    const loginBackgroundColor = text(payload.loginBackgroundColor ?? existing.loginBackgroundColor, 7);
    const loginBranding = payload.loginBranding === undefined ? existing.loginBranding : payload.loginBranding;
    const stampData = String(payload.stampData ?? "");
    const bankCurrency = text(payload.bankCurrency, 3).toUpperCase();
    const documentTemplate = text(payload.documentTemplate, 20);
    const documentColor = text(payload.documentColor, 7);
    if (!Number.isInteger(companyId) || companyId <= 0 || !name) return Response.json({ error: "Company name is required." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid company email address." }, { status: 400 });
    if (logoData && (!/^data:image\/(png|jpeg|webp);base64,/.test(logoData) || logoData.length > 700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP logo smaller than 500 KB." }, { status: 400 });
    if (loginLogoData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(loginLogoData) || loginLogoData.length > 700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP login image smaller than 500 KB." }, { status: 400 });
    if (loginCompanyLogoData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(loginCompanyLogoData) || loginCompanyLogoData.length > 700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP login company logo smaller than 500 KB." }, { status: 400 });
    if (!/^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/.test(loginCopyrightYears)) return Response.json({ error: "Enter copyright years such as 1996-2021." }, { status: 400 });
    if (loginBackgroundData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(loginBackgroundData) || loginBackgroundData.length > 2_700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP background smaller than 2 MB." }, { status: 400 });
    if (!/^#[0-9a-fA-F]{6}$/.test(loginBackgroundColor)) return Response.json({ error: "Choose a valid login background color." }, { status: 400 });
    if (typeof loginBranding !== "boolean") return Response.json({ error: "Choose whether to show this company on the login page." }, { status: 400 });
    if (rightLogoData && (!/^data:image\/(png|jpeg|webp);base64,/.test(rightLogoData) || rightLogoData.length > 700_000)) return Response.json({ error: "Upload a PNG, JPG, or WebP right logo smaller than 500 KB." }, { status: 400 });
    if (stampData && (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(stampData) || stampData.length > 700_000)) return Response.json({ error: "Upload an image stamp smaller than 500 KB." }, { status: 400 });
    if (!/^[A-Z]{3}$/.test(bankCurrency)) return Response.json({ error: "Choose a valid bank account currency." }, { status: 400 });
    const bankStampData = payload.bankStampData === undefined ? existing.bankStampData : String(payload.bankStampData ?? "");
    if (!validBankStamp(bankStampData)) return Response.json({ error: "Upload a PNG, JPG or WebP bank stamp smaller than 500 KB." }, { status: 400 });
    let bankAccounts = existing.bankAccounts;
    if (payload.bankAccounts !== undefined) {
      try { bankAccounts = JSON.stringify(parseBankAccounts(payload.bankAccounts)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the bank accounts." }, { status: 400 }); }
    }
    if (!templates.has(documentTemplate) || !/^#[0-9a-fA-F]{6}$/.test(documentColor)) return Response.json({ error: "Choose a valid document design and color." }, { status: 400 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      // A login page is shared across companies. Serialize selection so only one can be shown.
      if (loginBranding || loginBranding !== existing.loginBranding) {
        await db.execute(sql`LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE`);
        if (loginBranding) await db.update(companies).set({ loginBranding: false }).where(ne(companies.id, companyId));
      }
      const [updated] = await db.update(companies).set({
        name, logoData, rightLogoData, documentDesign, stampData, email, loginBranding, loginLogoData, loginCompanyLogoData, loginDisplayName, loginCopyrightYears, loginBackgroundData, loginBackgroundColor,
        addressLine1: text(payload.addressLine1, 180), addressLine2: text(payload.addressLine2, 180), city: text(payload.city, 80), country: text(payload.country, 80), phone: text(payload.phone, 40), trn: text(payload.trn, 40),
        bankAccounts, bankStampData, bankName: text(payload.bankName, 120), bankAccountName: text(payload.bankAccountName, 120), bankAccountNumber: text(payload.bankAccountNumber, 80), bankIban: text(payload.bankIban, 80).toUpperCase(), bankSwift: text(payload.bankSwift, 30).toUpperCase(), bankCurrency,
        documentTemplate: documentTemplate as "classic" | "modern" | "minimal", documentColor,
      }).where(eq(companies.id, companyId)).returning();
      if (!updated) return Response.json({ error: "Company not found." }, { status: 404 });
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "company_setup", entityId: companyId, details: `Company profile and login branding updated by ${user.email}` });
      return Response.json({ record: updated });
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
