import EnterpriseApp from "./enterprise-app";
import { LoginScreen } from "./login-screen";
import { PasswordChangeScreen } from "./password-change-screen";
import { getSessionUser } from "@/lib/auth";
import { publicLoginBranding, publicLoginCompanies } from "@/lib/public-login-branding";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    let branding;
    let availableCompanies: { id: number; name: string }[] = [];
    try {
      [availableCompanies, branding] = await Promise.all([publicLoginCompanies(), publicLoginBranding()]);
    } catch { /* Show the default sign-in page while the branding database is unavailable. */ }
    return <LoginScreen branding={branding} companies={availableCompanies} />;
  }
  if (user.mustChangePassword) return <PasswordChangeScreen email={user.email} />;
  const appUser = { ...user, isAllAdmin: user.role === "all_admin", role: user.role === "all_admin" ? ("admin" as const) : user.role };
  return <EnterpriseApp currentUser={appUser} />;
}
