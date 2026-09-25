import EnterpriseApp from "./enterprise-app";
import { LoginScreen } from "./login-screen";
import { PasswordChangeScreen } from "./password-change-screen";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    let branding: { name: string; logoData: string; loginLogoData: string; loginDisplayName: string; loginCopyrightYears: string; backgroundData: string; backgroundColor: string } | undefined;
    try {
      [branding] = await getDb().select({ name: companies.name, logoData: companies.logoData, loginLogoData: companies.loginLogoData, loginDisplayName: companies.loginDisplayName, loginCopyrightYears: companies.loginCopyrightYears, backgroundData: companies.loginBackgroundData, backgroundColor: companies.loginBackgroundColor })
        .from(companies).where(and(eq(companies.loginBranding, true), eq(companies.active, true))).limit(1);
    } catch { /* Show the default sign-in page while the branding database is unavailable. */ }
    return <LoginScreen branding={branding} />;
  }
  if (user.mustChangePassword) return <PasswordChangeScreen email={user.email} />;
  const appUser = { ...user, isAllAdmin: user.role === "all_admin", role: user.role === "all_admin" ? ("admin" as const) : user.role };
  return <EnterpriseApp currentUser={appUser} />;
}
