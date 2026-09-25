import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";

const fields = {
  id: companies.id, name: companies.name, logoData: companies.logoData,
  loginLogoData: companies.loginLogoData, loginCompanyLogoData: companies.loginCompanyLogoData,
  loginDisplayName: companies.loginDisplayName, loginCopyrightYears: companies.loginCopyrightYears,
  backgroundData: companies.loginBackgroundData, backgroundColor: companies.loginBackgroundColor,
};

export type PublicLoginBranding = {
  id: number; name: string; logoData: string; loginLogoData: string; loginCompanyLogoData: string;
  loginDisplayName: string; loginCopyrightYears: string; backgroundData: string; backgroundColor: string;
};

export async function publicLoginCompanies() {
  return getDb().select({ id: companies.id, name: companies.name }).from(companies)
    .where(eq(companies.active, true)).orderBy(asc(companies.name));
}

export async function publicLoginBranding(companyId?: number): Promise<PublicLoginBranding | undefined> {
  const db = getDb();
  const [shared] = await db.select(fields).from(companies)
    .where(and(eq(companies.active, true), eq(companies.loginBranding, true))).limit(1);
  const [selected] = companyId
    ? await db.select(fields).from(companies).where(and(eq(companies.active, true), eq(companies.id, companyId))).limit(1)
    : shared ? [shared] : await db.select(fields).from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name)).limit(1);
  if (!selected) return undefined;
  return {
    ...selected,
    // A company's logo/name stay its own. The shared upper image and background
    // provide the same login layout for newly added companies until customized.
    loginLogoData: selected.loginLogoData || shared?.loginLogoData || "",
    backgroundData: selected.backgroundData || shared?.backgroundData || "",
    backgroundColor: selected.backgroundColor === "#f3f6fa" && !selected.backgroundData
      ? shared?.backgroundColor || selected.backgroundColor : selected.backgroundColor,
  };
}
